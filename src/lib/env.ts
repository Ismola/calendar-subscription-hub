export const env = {
    databaseUrl: () =>process.env.REDIS_URL ?? "postgresql://postgres:postgres@localhost:5432/calendar-subscription-hub",
    redisUrl: () => process.env.REDIS_URL ?? "redis://localhost:6379",
    appBaseUrl: () => process.env.APP_BASE_URL ?? "http://localhost:3000",
    asismetroApiBaseUrl: () =>
        process.env.ASISMETRO_API_BASE_URL ??
        "http://asismetro-automations:3000",
    encryptionKey: () => process.env.APP_ENCRYPTION_KEY ?? "default_encryption_key",
    sessionSecret: () => process.env.SESSION_SECRET ?? "default_session_secret",
    asismetroBearerToken: () => process.env.ASISMETRO_BEARER_TOKEN ?? "default_bearer_token",
    asismetroRequestTimeoutMs: () => {
        const configured = Number(process.env.ASISMETRO_REQUEST_TIMEOUT_MS);
        return Number.isFinite(configured) && configured > 0 ? configured : 90_000;
    },
    defaultRefreshMinutes: () => Number(process.env.DEFAULT_REFRESH_MINUTES) || 360,
    asismetroMinSyncHours: () => Number(process.env.ASISMETRO_MIN_SYNC_HOURS) || 4,
};
