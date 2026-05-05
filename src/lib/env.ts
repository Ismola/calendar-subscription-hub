function required(name: string): string {
    const val = process.env[name];
    if (!val) throw new Error(`Missing required environment variable: ${name}`);
    return val;
}

export const env = {
    databaseUrl: () => required("DATABASE_URL"),
    redisUrl: () => process.env.REDIS_URL ?? "redis://localhost:6379",
    appBaseUrl: () => process.env.APP_BASE_URL ?? "http://localhost:3000",
    encryptionKey: () => required("APP_ENCRYPTION_KEY"),
    sessionSecret: () => required("SESSION_SECRET"),
    defaultRefreshMinutes: () =>
        parseInt(process.env.DEFAULT_REFRESH_MINUTES ?? "60", 10),
};
