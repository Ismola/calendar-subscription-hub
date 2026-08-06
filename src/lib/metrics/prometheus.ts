export interface SubscriptionMetricsRecord {
    provider: string;
    status: string;
    syncStatus: string;
    lastSuccessfulSyncAt: Date | null;
    nextRefreshAt: Date | null;
}

export interface SyncErrorMetricsRecord {
    provider: string;
    createdAt: Date;
}

export interface CalendarMetricsSnapshot {
    providers: string[];
    subscriptions: SubscriptionMetricsRecord[];
    syncErrors: SyncErrorMetricsRecord[];
}

function escapeLabelValue(value: string): string {
    return value
        .replaceAll("\\", "\\\\")
        .replaceAll("\n", "\\n")
        .replaceAll('"', '\\"');
}

function labels(values: Record<string, string>): string {
    return Object.entries(values)
        .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
        .join(",");
}

function increment(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1);
}

function unixTimestamp(date: Date | null): number {
    return date ? Math.floor(date.getTime() / 1000) : 0;
}

export function renderPrometheusMetrics(
    snapshot: CalendarMetricsSnapshot,
    now: Date = new Date()
): string {
    const providers = new Set(snapshot.providers);
    const subscriptions = new Map<string, number>();
    const overdue = new Map<string, number>();
    const retainedErrors = new Map<string, number>();
    const lastSuccessfulSync = new Map<string, number>();
    const lastSyncError = new Map<string, number>();

    for (const subscription of snapshot.subscriptions) {
        providers.add(subscription.provider);
        increment(
            subscriptions,
            labels({
                provider: subscription.provider,
                status: subscription.status,
                sync_status: subscription.syncStatus,
            })
        );

        if (
            subscription.nextRefreshAt &&
            subscription.nextRefreshAt < now &&
            subscription.syncStatus !== "RUNNING" &&
            subscription.status !== "DISABLED"
        ) {
            increment(overdue, subscription.provider);
        }

        const successTimestamp = unixTimestamp(subscription.lastSuccessfulSyncAt);
        if (
            successTimestamp > (lastSuccessfulSync.get(subscription.provider) ?? 0)
        ) {
            lastSuccessfulSync.set(subscription.provider, successTimestamp);
        }
    }

    for (const error of snapshot.syncErrors) {
        providers.add(error.provider);
        increment(retainedErrors, error.provider);

        const errorTimestamp = unixTimestamp(error.createdAt);
        if (errorTimestamp > (lastSyncError.get(error.provider) ?? 0)) {
            lastSyncError.set(error.provider, errorTimestamp);
        }
    }

    const lines = [
        "# HELP calendar_subscription_hub_metrics_collection_success Whether the application collected its database-backed metrics successfully.",
        "# TYPE calendar_subscription_hub_metrics_collection_success gauge",
        "calendar_subscription_hub_metrics_collection_success 1",
        "# HELP calendar_subscription_hub_subscriptions Current subscriptions grouped by provider and state.",
        "# TYPE calendar_subscription_hub_subscriptions gauge",
    ];

    for (const [metricLabels, value] of [...subscriptions.entries()].sort()) {
        lines.push(
            `calendar_subscription_hub_subscriptions{${metricLabels}} ${value}`
        );
    }

    lines.push(
        "# HELP calendar_subscription_hub_subscriptions_overdue Current subscriptions whose next refresh is overdue.",
        "# TYPE calendar_subscription_hub_subscriptions_overdue gauge",
        "# HELP calendar_subscription_hub_sync_errors_retained Sync errors currently retained in the application database.",
        "# TYPE calendar_subscription_hub_sync_errors_retained gauge",
        "# HELP calendar_subscription_hub_last_successful_sync_timestamp_seconds Most recent successful sync Unix timestamp per provider.",
        "# TYPE calendar_subscription_hub_last_successful_sync_timestamp_seconds gauge",
        "# HELP calendar_subscription_hub_last_sync_error_timestamp_seconds Most recent sync error Unix timestamp per provider.",
        "# TYPE calendar_subscription_hub_last_sync_error_timestamp_seconds gauge"
    );

    for (const provider of [...providers].sort()) {
        const providerLabels = labels({ provider });
        lines.push(
            `calendar_subscription_hub_subscriptions_overdue{${providerLabels}} ${overdue.get(provider) ?? 0}`,
            `calendar_subscription_hub_sync_errors_retained{${providerLabels}} ${retainedErrors.get(provider) ?? 0}`,
            `calendar_subscription_hub_last_successful_sync_timestamp_seconds{${providerLabels}} ${lastSuccessfulSync.get(provider) ?? 0}`,
            `calendar_subscription_hub_last_sync_error_timestamp_seconds{${providerLabels}} ${lastSyncError.get(provider) ?? 0}`
        );
    }

    return `${lines.join("\n")}\n`;
}
