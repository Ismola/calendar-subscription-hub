import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSubscriptionById } from "@/lib/subscriptions/service";
import { enqueueSync } from "@/lib/queue/client";
import { prisma } from "@/lib/db";

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const sub = await getSubscriptionById(id, session.userId);
    if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.calendarSubscription.update({
        where: { id: sub.id },
        data: {
            syncStatus: "IDLE",
            lastError: null,
        },
    });

    await enqueueSync(sub.id, { delay: 0, source: "manual" });

    return NextResponse.json({ ok: true, message: "Sync enqueued" });
}
