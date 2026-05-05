import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
    getSubscriptionById,
    deleteSubscription,
} from "@/lib/subscriptions/service";
import { env } from "@/lib/env";

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
            lastSuccessfulSyncAt: sub.lastSuccessfulSyncAt,
            nextRefreshAt: sub.nextRefreshAt,
            lastError: sub.lastError,
            createdAt: sub.createdAt,
            icsUrl: `${baseUrl}/${sub.publicId}`,
        },
    });
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
