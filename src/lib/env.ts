function allowDevFallbacks(): boolean {
    return (
        process.env.DEVCONTAINER === "true" ||
        process.env.NODE_ENV === "development"
    );
}

function required(name: string, devFallback?: string): string {
    const val = process.env[name];
    if (!val && devFallback !== undefined && allowDevFallbacks()) {
        return devFallback;
    }
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
    databaseUrl: () =>
        required(
            "DATABASE_URL",
            "postgresql://postgres:postgres@localhost:5432/calendar_subscription_hub?schema=public"
        ),
    redisUrl: () => process.env.REDIS_URL ?? "redis://localhost:6379",
    appBaseUrl: () => process.env.APP_BASE_URL ?? "http://localhost:3000",
    asismetroApiBaseUrl: () =>
        process.env.ASISMETRO_API_BASE_URL ??
        "http://asismetro-automations:3000",
    encryptionKey: () =>
        required("APP_ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef"),
    sessionSecret: () => required("SESSION_SECRET", "dev-session-secret"),
    asismetroBearerToken: () => required("ASISMETRO_BEARER_TOKEN", "sample"),
    defaultRefreshMinutes: () => positiveInt("DEFAULT_REFRESH_MINUTES", 60),
    asismetroMinSyncHours: () => positiveInt("ASISMETRO_MIN_SYNC_HOURS", 4),
};
