import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import {
    createSubscription,
    getUserSubscriptions,
} from "@/lib/subscriptions/service";
import { env } from "@/lib/env";

const createSchema = z.object({
    name: z.string().min(1).max(200),
    providerKey: z.string().min(1),
    config: z.record(z.string(), z.unknown()).default({}),
    secretConfig: z.record(z.string(), z.unknown()).optional(),
    refreshIntervalMinutes: z.number().int().min(5).max(1440).optional(),
});

export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const subscriptions = await getUserSubscriptions(session.userId);
    const baseUrl = env.appBaseUrl();

    return NextResponse.json({
        subscriptions: subscriptions.map((s) => ({
            id: s.id,
            publicId: s.publicId,
            name: s.name,
            status: s.status,
            syncStatus: s.syncStatus,
            providerKey: s.providerDefinition.key,
            providerName: s.providerDefinition.name,
            refreshIntervalMinutes: s.refreshIntervalMinutes,
            lastSuccessfulSyncAt: s.lastSuccessfulSyncAt,
            nextRefreshAt: s.nextRefreshAt,
            lastError: s.lastError,
            createdAt: s.createdAt,
            icsUrl: `${baseUrl}/${s.publicId}`,
        })),
    });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0].message },
            { status: 422 }
        );
    }

    try {
        const sub = await createSubscription({
            userId: session.userId,
            ...parsed.data,
        });

        const baseUrl = env.appBaseUrl();
        return NextResponse.json(
            {
                subscription: {
                    id: sub.id,
                    publicId: sub.publicId,
                    name: sub.name,
                    icsUrl: `${baseUrl}/${sub.publicId}`,
                },
            },
            { status: 201 }
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create subscription";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
