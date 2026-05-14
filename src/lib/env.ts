function required(name: string): string {
    const val = process.env[name];
    if (!val) throw new Error(`Missing required environment variable: ${name}`);
    return val;
}

function positiveInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

export const env = {
    databaseUrl: () => required("DATABASE_URL"),
    redisUrl: () => process.env.REDIS_URL ?? "redis://localhost:6379",
    appBaseUrl: () => process.env.APP_BASE_URL ?? "http://localhost:3000",
    asismetroApiBaseUrl: () =>
        process.env.ASISMETRO_API_BASE_URL ??
        "http://asismetro-automations:3000",
    encryptionKey: () => required("APP_ENCRYPTION_KEY"),
    sessionSecret: () => required("SESSION_SECRET"),
    asismetroBearerToken: () => required("ASISMETRO_BEARER_TOKEN"),
    defaultRefreshMinutes: () => positiveInt("DEFAULT_REFRESH_MINUTES", 60),
    asismetroMinSyncHours: () => positiveInt("ASISMETRO_MIN_SYNC_HOURS", 4),
};
