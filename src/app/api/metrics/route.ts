import { prisma } from "@/lib/db";
import { renderPrometheusMetrics } from "@/lib/metrics/prometheus";

export const dynamic = "force-dynamic";

const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

export async function GET() {
    const now = new Date();

    try {
        const [providers, subscriptions, syncErrors] = await prisma.$transaction([
            prisma.providerDefinition.findMany({
                select: { key: true },
            }),
            prisma.calendarSubscription.findMany({
                select: {
                    status: true,
                    syncStatus: true,
                    lastSuccessfulSyncAt: true,
                    nextRefreshAt: true,
                    providerDefinition: {
                        select: { key: true },
                    },
                },
            }),
            prisma.syncError.findMany({
                where: { expiresAt: { gt: now } },
                select: {
                    createdAt: true,
                    subscription: {
                        select: {
                            providerDefinition: {
                                select: { key: true },
                            },
                        },
                    },
                },
            }),
        ]);

        return new Response(
            renderPrometheusMetrics(
                {
                    providers: providers.map((provider) => provider.key),
                    subscriptions: subscriptions.map((subscription) => ({
                        provider: subscription.providerDefinition.key,
                        status: subscription.status,
                        syncStatus: subscription.syncStatus,
                        lastSuccessfulSyncAt: subscription.lastSuccessfulSyncAt,
                        nextRefreshAt: subscription.nextRefreshAt,
                    })),
                    syncErrors: syncErrors.map((error) => ({
                        provider: error.subscription.providerDefinition.key,
                        createdAt: error.createdAt,
                    })),
                },
                now
            ),
            {
                status: 200,
                headers: {
                    "Content-Type": CONTENT_TYPE,
                    "Cache-Control": "no-store",
                },
            }
        );
    } catch (error) {
        console.error("[metrics] Failed to collect Prometheus metrics", error);
        return new Response(
            [
                "# HELP calendar_subscription_hub_metrics_collection_success Whether the application collected its database-backed metrics successfully.",
                "# TYPE calendar_subscription_hub_metrics_collection_success gauge",
                "calendar_subscription_hub_metrics_collection_success 0",
                "",
            ].join("\n"),
            {
                status: 503,
                headers: {
                    "Content-Type": CONTENT_TYPE,
                    "Cache-Control": "no-store",
                },
            }
        );
    }
}
