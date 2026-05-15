import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSubscriptionById } from "@/lib/subscriptions/service";
import { prisma } from "@/lib/db";
import { runSubscriptionSync } from "@/lib/subscriptions/run-sync";

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const sub = await getSubscriptionById(id, session.userId);
    if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const result = await runSubscriptionSync({
        prisma,
        subscriptionId: sub.id,
        source: "manual",
        logPrefix: "[api-refresh]",
    });

    const status = result.status === "error" ? 502 : 200;
    return NextResponse.json(
        {
            ok: result.status === "success" || result.status === "rate_limited",
            status: result.status,
            message: result.message,
        },
        { status }
    );
}
