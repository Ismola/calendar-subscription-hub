import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { getProvider } from "@/lib/providers/registry";
import { enqueueSync } from "@/lib/queue/client";
import { Prisma } from "@prisma/client";
import type { CalendarSubscription, SubscriptionStatus } from "@prisma/client";

export interface CreateSubscriptionInput {
    userId: string;
    name: string;
    providerKey: string;
    config: Record<string, unknown>;
    secretConfig?: Record<string, unknown>;
    refreshIntervalMinutes?: number;
}

export interface UpdateSubscriptionInput {
    id: string;
    userId: string;
    name?: string;
    config?: Record<string, unknown>;
    secretConfig?: Record<string, unknown>;
    refreshIntervalMinutes?: number;
}

export interface SubscriptionWithProvider extends CalendarSubscription {
    providerDefinition: {
        id: string;
        key: string;
        name: string;
        description: string | null;
        status: string;
        defaultRefreshMinutes: number;
        configSchema: unknown;
    };
}

export async function createSubscription(
    input: CreateSubscriptionInput
): Promise<CalendarSubscription> {
    const provider = getProvider(input.providerKey);
    if (!provider) {
        throw new Error(`Unknown or disabled provider: ${input.providerKey}`);
    }

    await provider.validateConfig({
        ...input.config,
        ...(input.secretConfig ?? {}),
    });

    // Encrypt secret config if provided
    let encryptedSecretConfig: string | null = null;
    if (input.secretConfig && Object.keys(input.secretConfig).length > 0) {
        encryptedSecretConfig = await encrypt(JSON.stringify(input.secretConfig));
    }

    const refreshInterval =
        input.refreshIntervalMinutes ?? provider.defaultRefreshMinutes;
    const nextRefreshAt = new Date(Date.now() + refreshInterval * 60 * 1000);

    // Upsert ProviderDefinition in DB (so FK is valid)
    const providerDef = await prisma.providerDefinition.upsert({
        where: { key: provider.key },
        create: {
            key: provider.key,
            name: provider.name,
            description: provider.description,
            status: provider.enabled ? "enabled" : "disabled",
            defaultRefreshMinutes: provider.defaultRefreshMinutes,
            configSchema: provider.fields as unknown as object,
        },
        update: {
            name: provider.name,
            description: provider.description,
            status: provider.enabled ? "enabled" : "disabled",
            defaultRefreshMinutes: provider.defaultRefreshMinutes,
            configSchema: provider.fields as unknown as object,
        },
    });

    const subscription = await prisma.calendarSubscription.create({
        data: {
            name: input.name,
            userId: input.userId,
            providerDefinitionId: providerDef.id,
            status: "ACTIVE" as SubscriptionStatus,
            refreshIntervalMinutes: refreshInterval,
            config: input.config as Prisma.InputJsonValue,
            secretConfig: encryptedSecretConfig
                ? ({ encrypted: encryptedSecretConfig } as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            nextRefreshAt,
        },
    });

    // Schedule first sync
    await enqueueSync(subscription.id, { delay: 0 });

    return subscription;
}

export async function getUserSubscriptions(
    userId: string
): Promise<SubscriptionWithProvider[]> {
    return prisma.calendarSubscription.findMany({
        where: { userId },
        include: { providerDefinition: true },
        orderBy: { createdAt: "desc" },
    }) as Promise<SubscriptionWithProvider[]>;
}

export async function getSubscriptionByPublicId(
    publicId: string
): Promise<CalendarSubscription | null> {
    return prisma.calendarSubscription.findUnique({ where: { publicId } });
}

export async function getSubscriptionById(
    id: string,
    userId: string
): Promise<SubscriptionWithProvider | null> {
    return prisma.calendarSubscription.findFirst({
        where: { id, userId },
        include: { providerDefinition: true },
    }) as Promise<SubscriptionWithProvider | null>;
}

export async function deleteSubscription(
    id: string,
    userId: string
): Promise<void> {
    await prisma.calendarSubscription.deleteMany({ where: { id, userId } });
}

export async function updateSubscription(
    input: UpdateSubscriptionInput
): Promise<SubscriptionWithProvider> {
    const existing = await prisma.calendarSubscription.findFirst({
        where: { id: input.id, userId: input.userId },
        include: { providerDefinition: true },
    });

    if (!existing) {
        throw new Error("Subscription not found");
    }

    const provider = getProvider(existing.providerDefinition.key);
    if (!provider) {
        throw new Error(
            `Unknown or disabled provider: ${existing.providerDefinition.key}`
        );
    }

    const currentConfig = (existing.config ?? {}) as Record<string, unknown>;
    const currentSecretConfig = await getDecryptedSecretConfig(existing, {
        failOnError: false,
    });

    const mergedConfig = {
        ...currentConfig,
        ...(input.config ?? {}),
    };
    const mergedSecretConfig = {
        ...currentSecretConfig,
        ...(input.secretConfig ?? {}),
    };

    await provider.validateConfig({
        ...mergedConfig,
        ...mergedSecretConfig,
    });

    const refreshInterval =
        input.refreshIntervalMinutes ?? existing.refreshIntervalMinutes;
    const nextRefreshAt = new Date(Date.now() + refreshInterval * 60 * 1000);

    let encryptedSecretConfig: string | null = null;
    if (Object.keys(mergedSecretConfig).length > 0) {
        encryptedSecretConfig = await encrypt(JSON.stringify(mergedSecretConfig));
    }

    const updated = await prisma.calendarSubscription.update({
        where: { id: existing.id },
        data: {
            name: input.name ?? existing.name,
            refreshIntervalMinutes: refreshInterval,
            config: mergedConfig as Prisma.InputJsonValue,
            secretConfig: encryptedSecretConfig
                ? ({ encrypted: encryptedSecretConfig } as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            nextRefreshAt,
            syncStatus: "IDLE",
            lastError: null,
        },
        include: { providerDefinition: true },
    });

    return updated as SubscriptionWithProvider;
}

export async function getDecryptedSecretConfig(
    sub: CalendarSubscription,
    options?: { failOnError?: boolean }
): Promise<Record<string, unknown>> {
    if (!sub.secretConfig) return {};
    const raw = sub.secretConfig as Record<string, string>;
    if (!raw.encrypted) return {};

    try {
        const decrypted = await decrypt(raw.encrypted);
        return JSON.parse(decrypted) as Record<string, unknown>;
    } catch (err) {
        if (options?.failOnError ?? true) {
            const message =
                err instanceof Error
                    ? err.message
                    : "Failed to decrypt secret config";
            throw new Error(
                `Unable to decrypt secret config with current or legacy APP_ENCRYPTION_KEY: ${message}`
            );
        }
        return {};
    }
}

export async function getLatestSnapshot(
    subscriptionId: string
): Promise<{ icsBody: string } | null> {
    return prisma.calendarSnapshot.findFirst({
        where: { subscriptionId },
        orderBy: { version: "desc" },
        select: { icsBody: true },
    });
}
