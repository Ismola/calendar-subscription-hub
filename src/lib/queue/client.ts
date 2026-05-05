import { Queue } from "bullmq";
import IORedis from "ioredis";

const QUEUE_NAME = "calendar-sync";

let _queue: Queue | null = null;
let _connection: IORedis | null = null;

function getConnection(): IORedis {
    if (!_connection) {
        _connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        });
    }
    return _connection;
}

export function getSyncQueue(): Queue {
    if (!_queue) {
        _queue = new Queue(QUEUE_NAME, { connection: getConnection() });
    }
    return _queue;
}

export async function enqueueSync(
    subscriptionId: string,
    opts?: { delay?: number; jobId?: string }
): Promise<void> {
    const queue = getSyncQueue();
    await queue.add(
        "sync",
        { subscriptionId },
        {
            jobId: opts?.jobId ?? `sync-${subscriptionId}-${Date.now()}`,
            delay: opts?.delay ?? 0,
            attempts: 3,
            backoff: { type: "exponential", delay: 30_000 },
        }
    );
}

export { QUEUE_NAME };
