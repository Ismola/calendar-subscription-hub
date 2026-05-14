import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSubscriptionById } from "@/lib/subscriptions/service";
import { enqueueSync } from "@/lib/queue/client";
import { getProvider } from "@/lib/providers/registry";

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const sub = await getSubscriptionById(id, session.userId);
    if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const provider = getProvider(sub.providerDefinition.key);
    const minSyncIntervalMinutes = provider?.minSyncIntervalMinutes ?? 0;

    if (minSyncIntervalMinutes > 0 && sub.lastAttemptedSyncAt) {
        const minWindowMs = minSyncIntervalMinutes * 60 * 1000;
        const elapsedMs = Date.now() - sub.lastAttemptedSyncAt.getTime();

        if (elapsedMs < minWindowMs) {
            const retryAfterSeconds = Math.ceil((minWindowMs - elapsedMs) / 1000);
            return NextResponse.json(
                {
                    error: `Rate limit activo para ${sub.providerDefinition.name}. Espera ${Math.ceil(
                        retryAfterSeconds / 60
                    )} minuto(s) antes de volver a refrescar.`,
                    retryAfterSeconds,
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(retryAfterSeconds),
                    },
                }
            );
        }
    }

    await enqueueSync(sub.id, { delay: 0 });

    return NextResponse.json({ ok: true, message: "Sync enqueued" });
}
