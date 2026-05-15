import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { QUEUE_NAME, type SyncJobData } from "../lib/queue/client";
import { getProvider } from "../lib/providers/registry";
import { getDecryptedSecretConfig } from "../lib/subscriptions/service";
import { createHash } from "crypto";

const prisma = new PrismaClient();

const connection = new IORedis(
    process.env.REDIS_URL ?? "redis://localhost:6379",
    { maxRetriesPerRequest: null, enableReadyCheck: false }
);

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value ?? "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

const SNAPSHOT_RETENTION_COUNT = parsePositiveInt(
    process.env.SNAPSHOT_RETENTION_COUNT,
    30
);
const SYNC_ATTEMPT_RETENTION_COUNT = parsePositiveInt(
    process.env.SYNC_ATTEMPT_RETENTION_COUNT,
    200
);
const SYNC_ATTEMPT_RETENTION_DAYS = parsePositiveInt(
    process.env.SYNC_ATTEMPT_RETENTION_DAYS,
    90
);
const SYNC_ERROR_RETENTION_DAYS = parsePositiveInt(
    process.env.SYNC_ERROR_RETENTION_DAYS,
    30
);

async function pruneSubscriptionHistory(subscriptionId: string): Promise<void> {
    const staleSnapshots = await prisma.calendarSnapshot.findMany({
        where: { subscriptionId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: SNAPSHOT_RETENTION_COUNT,
        select: { id: true },
    });

    if (staleSnapshots.length > 0) {
        await prisma.calendarSnapshot.deleteMany({
            where: {
                id: {
                    in: staleSnapshots.map((snapshot) => snapshot.id),
                },
            },
        });
    }

    const attemptsCutoff = new Date(
        Date.now() - SYNC_ATTEMPT_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    await prisma.syncAttempt.deleteMany({
        where: {
            subscriptionId,
            startedAt: { lt: attemptsCutoff },
        },
    });

    const staleAttempts = await prisma.syncAttempt.findMany({
        where: { subscriptionId },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        skip: SYNC_ATTEMPT_RETENTION_COUNT,
        select: { id: true },
    });

    if (staleAttempts.length > 0) {
        await prisma.syncAttempt.deleteMany({
            where: {
                id: {
                    in: staleAttempts.map((attempt) => attempt.id),
                },
            },
        });
    }

    // Clean up old sync errors
    const errorsCutoff = new Date(
        Date.now() - SYNC_ERROR_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    await prisma.syncError.deleteMany({
        where: {
            subscriptionId,
            createdAt: { lt: errorsCutoff },
        },
    });
}

async function processSync(job: Job<SyncJobData>): Promise<void> {
    const { subscriptionId } = job.data;
    const source = job.data.source ?? "auto";
    const isManual = source === "manual";

    const sub = await prisma.calendarSubscription.findUnique({
        where: { id: subscriptionId },
        include: { providerDefinition: true },
    });

    if (!sub || sub.status === "DISABLED") {
        console.log(`[worker] Skipping ${subscriptionId}: not found or disabled`);
        return;
    }

    const provider = getProvider(sub.providerDefinition.key);
    if (!provider) {
        console.log(
            `[worker] Provider "${sub.providerDefinition.key}" not found in registry, skipping`
        );
        const errorMsg = `Provider "${sub.providerDefinition.key}" is not available`;
        await prisma.calendarSubscription.update({
            where: { id: subscriptionId },
            data: {
                syncStatus: "ERROR",
                lastError: errorMsg,
                lastAttemptedSyncAt: new Date(),
            },
        });

        // Save error to SyncError table
        const expiresAt = new Date(
            Date.now() + SYNC_ERROR_RETENTION_DAYS * 24 * 60 * 60 * 1000
        );
        await prisma.syncError.create({
            data: {
                subscriptionId,
                userId: sub.userId,
                errorMessage: errorMsg,
                expiresAt,
            },
        });
        return;
    }

    const minSyncIntervalMinutes = provider.minSyncIntervalMinutes ?? 0;
    if (!isManual && minSyncIntervalMinutes > 0 && sub.lastAttemptedSyncAt) {
        const minWindowMs = minSyncIntervalMinutes * 60 * 1000;
        const elapsedMs = Date.now() - sub.lastAttemptedSyncAt.getTime();

        if (elapsedMs < minWindowMs) {
            const waitMs = minWindowMs - elapsedMs;
            const nextAllowedAt = new Date(Date.now() + waitMs);

            await prisma.calendarSubscription.update({
                where: { id: subscriptionId },
                data: {
                    syncStatus: "IDLE",
                    nextRefreshAt: nextAllowedAt,
                },
            });

            const { getSyncQueue } = await import("../lib/queue/client");
            await getSyncQueue().add(
                "sync",
                {
                    subscriptionId,
                    source: "auto",
                },
                {
                    jobId: `sync-${subscriptionId}-${Date.now()}`,
                    delay: waitMs,
                    attempts: 1,
                }
            );

            console.log(
                `[worker] Rate limited ${subscriptionId}; re-scheduled in ${Math.ceil(
                    waitMs / 60000
                )} min`
            );
            return;
        }
    }

    // Mark as running
    await prisma.calendarSubscription.update({
        where: { id: subscriptionId },
        data: { syncStatus: "RUNNING", lastAttemptedSyncAt: new Date() },
    });

    const attempt = await prisma.syncAttempt.create({
        data: { subscriptionId, status: "RUNNING" },
    });

    try {
        const publicConfig = sub.config as Record<string, unknown>;
        const secretConfig = await getDecryptedSecretConfig(sub);

        const result = await provider.sync(publicConfig, secretConfig);

        // Persist snapshot
        const lastSnapshot = await prisma.calendarSnapshot.findFirst({
            where: { subscriptionId },
            orderBy: { version: "desc" },
            select: { version: true },
        });

        const nextVersion = (lastSnapshot?.version ?? 0) + 1;
        const checksum = createHash("sha256").update(result.icsBody).digest("hex");

        await prisma.calendarSnapshot.create({
            data: {
                subscriptionId,
                version: nextVersion,
                icsBody: result.icsBody,
                sourceChecksum: checksum,
            },
        });

        // Schedule next refresh
        const nextRefreshAt = new Date(
            Date.now() + sub.refreshIntervalMinutes * 60 * 1000
        );

        await prisma.calendarSubscription.update({
            where: { id: subscriptionId },
            data: {
                syncStatus: "SUCCESS",
                status: "ACTIVE",
                lastSuccessfulSyncAt: new Date(),
                nextRefreshAt,
                lastError: null,
            },
        });

        await prisma.syncAttempt.update({
            where: { id: attempt.id },
            data: { status: "SUCCESS", finishedAt: new Date() },
        });

        // Enqueue next sync
        const { getSyncQueue } = await import("../lib/queue/client");
        await getSyncQueue().add(
            "sync",
            {
                subscriptionId,
                source: "auto",
            },
            {
                jobId: `sync-${subscriptionId}-${Date.now()}`,
                delay: sub.refreshIntervalMinutes * 60 * 1000,
                attempts: 3,
                backoff: { type: "exponential", delay: 30_000 },
            }
        );

        console.log(`[worker] Synced ${subscriptionId} (v${nextVersion})`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        console.error(`[worker] Error syncing ${subscriptionId}: ${message}`);

        await prisma.calendarSubscription.update({
            where: { id: subscriptionId },
            data: { syncStatus: "ERROR", lastError: message },
        });

        await prisma.syncAttempt.update({
            where: { id: attempt.id },
            data: { status: "ERROR", message, finishedAt: new Date() },
        });

        // Save error to SyncError table for admin visibility
        const expiresAt = new Date(
            Date.now() + SYNC_ERROR_RETENTION_DAYS * 24 * 60 * 60 * 1000
        );
        await prisma.syncError.create({
            data: {
                subscriptionId,
                userId: sub.userId,
                errorMessage: message,
                stackTrace: stack,
                expiresAt,
            },
        });

        throw err; // Let BullMQ handle retries
    } finally {
        try {
            await pruneSubscriptionHistory(subscriptionId);
        } catch (pruneErr) {
            const message =
                pruneErr instanceof Error ? pruneErr.message : String(pruneErr);
            console.error(
                `[worker] Cleanup failed for ${subscriptionId}: ${message}`
            );
        }
    }
}

const worker = new Worker<SyncJobData>(QUEUE_NAME, processSync, {
    connection,
    concurrency: 5,
});

worker.on("completed", (job) => {
    console.log(`[worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
    console.error(`[worker] Job ${job?.id} failed: ${err.message}`);
});

console.log("[worker] Calendar sync worker started");

// Graceful shutdown
async function shutdown() {
    console.log("[worker] Shutting down...");
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
