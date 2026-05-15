import IORedis from "ioredis";

let _redis: IORedis | null = null;

export function getRedisClient(): IORedis {
    if (!_redis) {
        _redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        });
    }

    return _redis;
}