import assert from "node:assert/strict";
import test from "node:test";
import { renderPrometheusMetrics } from "./prometheus";

test("renders aggregated application metrics without subscription identifiers", () => {
    const metrics = renderPrometheusMetrics(
        {
            providers: ["asismetro", 'escaped"provider\\name'],
            subscriptions: [
                {
                    provider: "asismetro",
                    status: "ACTIVE",
                    syncStatus: "SUCCESS",
                    lastSuccessfulSyncAt: new Date("2026-08-06T10:00:00Z"),
                    nextRefreshAt: new Date("2026-08-06T13:00:00Z"),
                },
                {
                    provider: "asismetro",
                    status: "ERROR",
                    syncStatus: "ERROR",
                    lastSuccessfulSyncAt: new Date("2026-08-05T10:00:00Z"),
                    nextRefreshAt: new Date("2026-08-06T11:00:00Z"),
                },
            ],
            syncErrors: [
                {
                    provider: "asismetro",
                    createdAt: new Date("2026-08-06T12:30:00Z"),
                },
            ],
        },
        new Date("2026-08-06T12:00:00Z")
    );

    assert.match(
        metrics,
        /calendar_subscription_hub_subscriptions\{provider="asismetro",status="ACTIVE",sync_status="SUCCESS"\} 1/
    );
    assert.match(
        metrics,
        /calendar_subscription_hub_subscriptions\{provider="asismetro",status="ERROR",sync_status="ERROR"\} 1/
    );
    assert.match(
        metrics,
        /calendar_subscription_hub_subscriptions_overdue\{provider="asismetro"\} 1/
    );
    assert.match(
        metrics,
        /calendar_subscription_hub_sync_errors_retained\{provider="asismetro"\} 1/
    );
    assert.match(
        metrics,
        /calendar_subscription_hub_last_successful_sync_timestamp_seconds\{provider="asismetro"\} 1786010400/
    );
    assert.match(
        metrics,
        /calendar_subscription_hub_last_sync_error_timestamp_seconds\{provider="asismetro"\} 1786019400/
    );
    assert.match(metrics, /provider="escaped\\"provider\\\\name"/);
    assert.doesNotMatch(metrics, /subscription_id|user_id|email/);
});

test("renders explicit zero values for providers without activity", () => {
    const metrics = renderPrometheusMetrics({
        providers: ["empty"],
        subscriptions: [],
        syncErrors: [],
    });

    assert.match(
        metrics,
        /calendar_subscription_hub_sync_errors_retained\{provider="empty"\} 0/
    );
    assert.match(
        metrics,
        /calendar_subscription_hub_last_sync_error_timestamp_seconds\{provider="empty"\} 0/
    );
});
