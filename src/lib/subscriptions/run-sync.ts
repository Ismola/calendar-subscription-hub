import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";
import { getProvider } from "@/lib/providers/registry";
import { getDecryptedSecretConfig } from "@/lib/subscriptions/service";

type SyncSource = "auto" | "manual";

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

export interface RunSubscriptionSyncOptions {
    prisma: PrismaClient;
    subscriptionId: string;
    source?: SyncSource;
    throwOnError?: boolean;
    logPrefix?: string;
}

export interface RunSubscriptionSyncResult {
    status: "success" | "error" | "skipped" | "rate_limited";
    message?: string;
}

async function pruneSubscriptionHistory(
    prisma: PrismaClient,
    subscriptionId: string
): Promise<void> {
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

export async function runSubscriptionSync(
    opts: RunSubscriptionSyncOptions
): Promise<RunSubscriptionSyncResult> {
    const source = opts.source ?? "manual";
    const isManual = source === "manual";
    const logPrefix = opts.logPrefix ?? "[sync]";

    const sub = await opts.prisma.calendarSubscription.findUnique({
        where: { id: opts.subscriptionId },
        include: { providerDefinition: true },
    });

    if (!sub || sub.status === "DISABLED") {
        console.log(
            `${logPrefix} Skipping ${opts.subscriptionId}: not found or disabled`
        );
        return { status: "skipped" };
    }

    const provider = getProvider(sub.providerDefinition.key);
    if (!provider) {
        const errorMsg = `Provider "${sub.providerDefinition.key}" is not available`;

        await opts.prisma.calendarSubscription.update({
            where: { id: opts.subscriptionId },
            data: {
                syncStatus: "ERROR",
                lastError: errorMsg,
                lastAttemptedSyncAt: new Date(),
            },
        });

        const expiresAt = new Date(
            Date.now() + SYNC_ERROR_RETENTION_DAYS * 24 * 60 * 60 * 1000
        );
        await opts.prisma.syncError.create({
            data: {
                subscriptionId: opts.subscriptionId,
                userId: sub.userId,
                errorMessage: errorMsg,
                expiresAt,
            },
        });

        return { status: "error", message: errorMsg };
    }

    const minSyncIntervalMinutes = provider.minSyncIntervalMinutes ?? 0;
    if (!isManual && minSyncIntervalMinutes > 0 && sub.lastAttemptedSyncAt) {
        const minWindowMs = minSyncIntervalMinutes * 60 * 1000;
        const elapsedMs = Date.now() - sub.lastAttemptedSyncAt.getTime();

        if (elapsedMs < minWindowMs) {
            const waitMs = minWindowMs - elapsedMs;
            const nextAllowedAt = new Date(Date.now() + waitMs);

            await opts.prisma.calendarSubscription.update({
                where: { id: opts.subscriptionId },
                data: {
                    syncStatus: "IDLE",
                    nextRefreshAt: nextAllowedAt,
                },
            });

            return {
                status: "rate_limited",
                message: "Sync rate-limited by provider settings",
            };
        }
    }

    await opts.prisma.calendarSubscription.update({
        where: { id: opts.subscriptionId },
        data: { syncStatus: "RUNNING", lastAttemptedSyncAt: new Date() },
    });

    const attempt = await opts.prisma.syncAttempt.create({
        data: { subscriptionId: opts.subscriptionId, status: "RUNNING" },
    });

    try {
        const publicConfig = sub.config as Record<string, unknown>;
        const secretConfig = await getDecryptedSecretConfig(sub);
        const result = await provider.sync(publicConfig, secretConfig);

        const lastSnapshot = await opts.prisma.calendarSnapshot.findFirst({
            where: { subscriptionId: opts.subscriptionId },
            orderBy: { version: "desc" },
            select: { version: true },
        });

        const nextVersion = (lastSnapshot?.version ?? 0) + 1;
        const checksum = createHash("sha256").update(result.icsBody).digest("hex");

        await opts.prisma.calendarSnapshot.create({
            data: {
                subscriptionId: opts.subscriptionId,
                version: nextVersion,
                icsBody: result.icsBody,
                sourceChecksum: checksum,
            },
        });

        const nextRefreshAt = new Date(
            Date.now() + sub.refreshIntervalMinutes * 60 * 1000
        );

        await opts.prisma.calendarSubscription.update({
            where: { id: opts.subscriptionId },
            data: {
                syncStatus: "SUCCESS",
                status: "ACTIVE",
                lastSuccessfulSyncAt: new Date(),
                nextRefreshAt,
                lastError: null,
            },
        });

        await opts.prisma.syncAttempt.update({
            where: { id: attempt.id },
            data: { status: "SUCCESS", finishedAt: new Date() },
        });

        console.log(`${logPrefix} Synced ${opts.subscriptionId} (v${nextVersion})`);
        return { status: "success" };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;

        await opts.prisma.calendarSubscription.update({
            where: { id: opts.subscriptionId },
            data: { syncStatus: "ERROR", lastError: message },
        });

        await opts.prisma.syncAttempt.update({
            where: { id: attempt.id },
            data: { status: "ERROR", message, finishedAt: new Date() },
        });

        const expiresAt = new Date(
            Date.now() + SYNC_ERROR_RETENTION_DAYS * 24 * 60 * 60 * 1000
        );
        await opts.prisma.syncError.create({
            data: {
                subscriptionId: opts.subscriptionId,
                userId: sub.userId,
                errorMessage: message,
                stackTrace: stack,
                expiresAt,
            },
        });

        if (opts.throwOnError) {
            throw err;
        }

        return { status: "error", message };
    } finally {
        try {
            await pruneSubscriptionHistory(opts.prisma, opts.subscriptionId);
        } catch (pruneErr) {
            const message =
                pruneErr instanceof Error ? pruneErr.message : String(pruneErr);
            console.error(`${logPrefix} Cleanup failed for ${opts.subscriptionId}: ${message}`);
        }
    }
}