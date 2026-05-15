import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { QUEUE_NAME, type SyncJobData } from "../lib/queue/client";
import { runSubscriptionSync } from "../lib/subscriptions/run-sync";

const prisma = new PrismaClient();

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

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

console.log("[worker] Calendar sync worker started");

async function shutdown() {
    console.log("[worker] Shutting down...");
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
