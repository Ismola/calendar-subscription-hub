import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@/lib/db";
import { enqueueSync, QUEUE_NAME, type SyncJobData } from "../lib/queue/client";
import { runSubscriptionSync } from "../lib/subscriptions/run-sync";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

const SCHEDULER_POLL_INTERVAL_MS = parseInt(
    process.env.SYNC_SCHEDULER_INTERVAL_MS ?? "15000",
    10
);

async function processSync(job: Job<SyncJobData>): Promise<void> {
    await runSubscriptionSync({
        prisma,
        subscriptionId: job.data.subscriptionId,
        source: job.data.source ?? "auto",
        throwOnError: true,
        logPrefix: "[worker]",
    });
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

async function enqueueDueSubscriptions(): Promise<void> {
    const now = new Date();
    const dueSubscriptions = await prisma.calendarSubscription.findMany({
        where: {
            status: "ACTIVE",
            syncStatus: { not: "RUNNING" },
            OR: [{ nextRefreshAt: { lte: now } }, { nextRefreshAt: null }],
        },
        select: { id: true },
    });

    if (dueSubscriptions.length === 0) {
        return;
    }

    for (const subscription of dueSubscriptions) {
        try {
            await enqueueSync(subscription.id, {
                jobId: `sync-${subscription.id}`,
            });
            console.log(`[scheduler] Enqueued auto-sync for ${subscription.id}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes("JobAlreadyExists") || message.includes("exists")) {
                continue;
            }
            console.error(
                `[scheduler] Failed to enqueue sync for ${subscription.id}: ${message}`
            );
        }
    }
}

async function startScheduler(): Promise<void> {
    try {
        await enqueueDueSubscriptions();
    } catch (err) {
        console.error(
            `[scheduler] Initial fetch failed: ${err instanceof Error ? err.message : String(err)
            }`
        );
    }

    setInterval(async () => {
        try {
            await enqueueDueSubscriptions();
        } catch (err) {
            console.error(
                `[scheduler] Polling failed: ${err instanceof Error ? err.message : String(err)
                }`
            );
        }
    }, SCHEDULER_POLL_INTERVAL_MS);
}

startScheduler();

console.log("[worker] Calendar sync worker started");

async function shutdown() {
    console.log("[worker] Shutting down...");
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
