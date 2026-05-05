"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Subscription {
    id: string;
    publicId: string;
    name: string;
    status: string;
    syncStatus: string;
    providerName: string;
    refreshIntervalMinutes: number;
    lastSuccessfulSyncAt: string | null;
    nextRefreshAt: string | null;
    lastError: string | null;
    icsUrl: string;
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        ACTIVE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
        PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
        ERROR: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        DISABLED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
    };
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? map.PENDING}`}>
            {status.toLowerCase()}
        </span>
    );
}

export default function DashboardPage() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/subscriptions")
            .then((r) => r.json())
            .then((d) => setSubscriptions(d.subscriptions ?? []))
            .finally(() => setLoading(false));
    }, []);

    async function handleDelete(id: string) {
        if (!confirm("Delete this subscription? This cannot be undone.")) return;
        await fetch(`/api/subscriptions/${id}`, { method: "DELETE" });
        setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    }

    async function handleRefresh(id: string) {
        await fetch(`/api/subscriptions/${id}/refresh`, { method: "POST" });
    }

    async function copyUrl(id: string, url: string) {
        await navigator.clipboard.writeText(url);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24 text-zinc-400">
                Loading…
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                    Your calendars
                </h1>
                <Link
                    href="/dashboard/new"
                    className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
                >
                    + New calendar
                </Link>
            </div>

            {subscriptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-12 text-center">
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                        No calendars yet.
                    </p>
                    <p className="mt-1 text-zinc-400 dark:text-zinc-500 text-xs">
                        Add a new calendar to get started once providers are available.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {subscriptions.map((sub) => (
                        <div
                            key={sub.id}
                            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-zinc-900 dark:text-zinc-50 truncate">
                                            {sub.name}
                                        </span>
                                        <StatusBadge status={sub.status} />
                                        {sub.syncStatus === "ERROR" && (
                                            <StatusBadge status="ERROR" />
                                        )}
                                    </div>
                                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                        Provider: {sub.providerName} · Refresh every{" "}
                                        {sub.refreshIntervalMinutes} min
                                    </p>
                                    {sub.lastError && (
                                        <p className="mt-1 text-xs text-red-600 dark:text-red-400 truncate">
                                            {sub.lastError}
                                        </p>
                                    )}
                                    <div className="mt-2 flex items-center gap-2">
                                        <code className="flex-1 truncate rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 font-mono">
                                            {sub.icsUrl}
                                        </code>
                                        <button
                                            onClick={() => copyUrl(sub.id, sub.icsUrl)}
                                            className="shrink-0 text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                        >
                                            {copiedId === sub.id ? "Copied!" : "Copy"}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => handleRefresh(sub.id)}
                                        title="Force refresh"
                                        className="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                    >
                                        ↻
                                    </button>
                                    <button
                                        onClick={() => handleDelete(sub.id)}
                                        title="Delete"
                                        className="text-xs px-2 py-1 rounded border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
