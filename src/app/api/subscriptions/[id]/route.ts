import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import {
    getSubscriptionById,
    deleteSubscription,
    getDecryptedSecretConfig,
    updateSubscription,
} from "@/lib/subscriptions/service";
import { env } from "@/lib/env";

const updateSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    secretConfig: z.record(z.string(), z.unknown()).optional(),
    refreshIntervalMinutes: z.number().int().min(5).max(1440).optional(),
});

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const sub = await getSubscriptionById(id, session.userId);
    if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const baseUrl = env.appBaseUrl();
    const secretConfig = await getDecryptedSecretConfig(sub);
    const publicConfig = (sub.config ?? {}) as Record<string, unknown>;

    return NextResponse.json(
        {
            subscription: {
                id: sub.id,
                publicId: sub.publicId,
                name: sub.name,
                status: sub.status,
                syncStatus: sub.syncStatus,
                providerKey: sub.providerDefinition.key,
                providerName: sub.providerDefinition.name,
                refreshIntervalMinutes: sub.refreshIntervalMinutes,
                lastSuccessfulSyncAt: sub.lastSuccessfulSyncAt,
                nextRefreshAt: sub.nextRefreshAt,
                lastError: sub.lastError,
                createdAt: sub.createdAt,
                icsUrl: `${baseUrl}/${sub.publicId}`,
                config: publicConfig,
                editableConfig: {
                    ...publicConfig,
                    ...secretConfig,
                },
                secretConfiguredKeys: Object.keys(secretConfig),
            },
        },
        {
            headers: {
                "Cache-Control": "no-store",
            },
        }
    );
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0].message },
            { status: 422 }
        );
    }

    const { id } = await params;
    try {
        const sub = await updateSubscription({
            id,
            userId: session.userId,
            ...parsed.data,
        });

        const baseUrl = env.appBaseUrl();
        return NextResponse.json({
            subscription: {
                id: sub.id,
                publicId: sub.publicId,
                name: sub.name,
                status: sub.status,
                syncStatus: sub.syncStatus,
                providerKey: sub.providerDefinition.key,
                providerName: sub.providerDefinition.name,
                refreshIntervalMinutes: sub.refreshIntervalMinutes,
                nextRefreshAt: sub.nextRefreshAt,
                icsUrl: `${baseUrl}/${sub.publicId}`,
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update subscription";
        const status = message === "Subscription not found" ? 404 : 400;
        return NextResponse.json({ error: message }, { status });
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await deleteSubscription(id, session.userId);
    return NextResponse.json({ ok: true });
}
