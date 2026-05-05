import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSubscriptionById } from "@/lib/subscriptions/service";
import { enqueueSync } from "@/lib/queue/client";

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const sub = await getSubscriptionById(id, session.userId);
    if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await enqueueSync(sub.id, { delay: 0 });

    return NextResponse.json({ ok: true, message: "Sync enqueued" });
}
