import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { QUEUE_NAME } from "../lib/queue/client";
import { getProvider } from "../lib/providers/registry";
import { getDecryptedSecretConfig } from "../lib/subscriptions/service";
import { createHash } from "crypto";

const prisma = new PrismaClient();

const connection = new IORedis(
    process.env.REDIS_URL ?? "redis://localhost:6379",
    { maxRetriesPerRequest: null, enableReadyCheck: false }
);

interface SyncJobData {
    subscriptionId: string;
}

async function processSync(job: Job<SyncJobData>): Promise<void> {
    const { subscriptionId } = job.data;

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
        await prisma.calendarSubscription.update({
            where: { id: subscriptionId },
            data: {
                syncStatus: "ERROR",
                lastError: `Provider "${sub.providerDefinition.key}" is not available`,
                lastAttemptedSyncAt: new Date(),
            },
        });
        return;
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
            { subscriptionId },
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
        console.error(`[worker] Error syncing ${subscriptionId}: ${message}`);

        await prisma.calendarSubscription.update({
            where: { id: subscriptionId },
            data: { syncStatus: "ERROR", lastError: message },
        });

        await prisma.syncAttempt.update({
            where: { id: attempt.id },
            data: { status: "ERROR", message, finishedAt: new Date() },
        });

        throw err; // Let BullMQ handle retries
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
