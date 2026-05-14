"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AdminStats {
    totalUsers: number;
    totalSubscriptions: number;
    subscriptionsByStatus: Record<string, number>;
    subscriptionsBySyncStatus: Record<string, number>;
}

interface User {
    id: string;
    email: string;
    displayName: string | null;
    createdAt: string;
    _count: {
        subscriptions: number;
    };
}

interface SyncError {
    id: string;
    createdAt: string;
    expiresAt: string;
    errorMessage: string;
    stackTrace?: string;
    user: {
        id: string;
        email: string;
        displayName: string | null;
    };
    subscription: {
        id: string;
        name: string;
        publicId: string;
        providerDefinition: {
            key: string;
            name: string;
        };
    };
}

interface SyncErrorsResponse {
    recentErrors: SyncError[];
    errorsByUser: Array<{
        user: User | null;
        errorCount: number;
    }>;
    totalErrors: number;
}

export default function AdminPage() {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [syncErrors, setSyncErrors] = useState<SyncErrorsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedError, setExpandedError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            fetch("/api/admin/stats").then((r) => r.json()),
            fetch("/api/admin/sync-errors").then((r) => r.json()),
        ])
            .then(([statsData, errorsData]) => {
                setStats(statsData.stats);
                setUsers(statsData.users ?? []);
                setSyncErrors(errorsData);
            })
            .catch((err: unknown) => {
                setError(
                    err instanceof Error ? err.message : "Failed to load admin data"
                );
            })
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24 text-zinc-400">
                Cargando...
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-4">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                <Link
                    href="/dashboard"
                    className="mt-2 inline-block text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
                >
                    ← Back to dashboard
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                    Admin Panel
                </h1>
                <Link
                    href="/dashboard"
                    className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
                >
                    ← Back
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                        Total Users
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                        {stats?.totalUsers ?? 0}
                    </p>
                </div>

                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                        Total Calendars
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                        {stats?.totalSubscriptions ?? 0}
                    </p>
                </div>

                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                        Active Calendars
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                        {stats?.subscriptionsByStatus.ACTIVE ?? 0}
                    </p>
                </div>

                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                        Sync Errors
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-red-600 dark:text-red-400">
                        {stats?.subscriptionsBySyncStatus.ERROR ?? 0}
                    </p>
                </div>
            </div>

            {/* Subscription Status Distribution */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                        Calendar Status Distribution
                    </h2>
                    <div className="space-y-2">
                        {Object.entries(stats?.subscriptionsByStatus ?? {}).map(
                            ([status, count]) => (
                                <div key={status} className="flex items-center justify-between">
                                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                                        {status}
                                    </span>
                                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                        {count}
                                    </span>
                                </div>
                            )
                        )}
                    </div>
                </div>

                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                        Sync Status Distribution
                    </h2>
                    <div className="space-y-2">
                        {Object.entries(stats?.subscriptionsBySyncStatus ?? {}).map(
                            ([status, count]) => (
                                <div key={status} className="flex items-center justify-between">
                                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                                        {status}
                                    </span>
                                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                        {count}
                                    </span>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* Users Table */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        Registered Users ({users.length})
                    </h2>
                </div>

                {users.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                                <tr>
                                    <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">
                                        Email
                                    </th>
                                    <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">
                                        Name
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                                        Calendars
                                    </th>
                                    <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">
                                        Created
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                {users.map((user) => (
                                    <tr key={user.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                        <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50 font-mono">
                                            {user.email}
                                        </td>
                                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                                            {user.displayName || "—"}
                                        </td>
                                        <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400 font-medium">
                                            {user._count.subscriptions}
                                        </td>
                                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                                            {new Intl.DateTimeFormat("es-ES", {
                                                year: "numeric",
                                                month: "2-digit",
                                                day: "2-digit",
                                            }).format(new Date(user.createdAt))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="px-4 py-12 text-center text-zinc-500 dark:text-zinc-400">
                        No users registered yet.
                    </div>
                )}
            </div>

            {/* Sync Errors Section */}
            {syncErrors && (
                <>
                    {/* Errors by User */}
                    {syncErrors.errorsByUser.length > 0 && (
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                                Top Users with Sync Errors ({syncErrors.totalErrors} total)
                            </h2>
                            <div className="space-y-2">
                                {syncErrors.errorsByUser.map((item) => (
                                    <div
                                        key={item.user?.id}
                                        className="flex items-center justify-between p-2 rounded bg-red-50 dark:bg-red-900/10"
                                    >
                                        <div>
                                            <p className="text-xs font-medium text-zinc-900 dark:text-zinc-50">
                                                {item.user?.email}
                                            </p>
                                            <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                                {item.user?.displayName}
                                            </p>
                                        </div>
                                        <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                                            {item.errorCount} error{item.errorCount !== 1 ? "s" : ""}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recent Errors */}
                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
                            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                                Recent Sync Errors ({syncErrors.recentErrors.length})
                            </h2>
                        </div>

                        {syncErrors.recentErrors.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                                        <tr>
                                            <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">
                                                User
                                            </th>
                                            <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">
                                                Calendar
                                            </th>
                                            <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">
                                                Provider
                                            </th>
                                            <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">
                                                Error
                                            </th>
                                            <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">
                                                Date
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                        {syncErrors.recentErrors.map((err) => (
                                            <tr
                                                key={err.id}
                                                className="hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors cursor-pointer"
                                                onClick={() =>
                                                    setExpandedError(
                                                        expandedError === err.id ? null : err.id
                                                    )
                                                }
                                            >
                                                <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50 font-mono text-xs">
                                                    {err.user.email}
                                                </td>
                                                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                                                    {err.subscription.name}
                                                </td>
                                                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                                                    {err.subscription.providerDefinition.name}
                                                </td>
                                                <td className="px-4 py-2 text-red-600 dark:text-red-400 truncate max-w-xs">
                                                    {err.errorMessage}
                                                </td>
                                                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                                                    {new Intl.DateTimeFormat("es-ES", {
                                                        year: "numeric",
                                                        month: "2-digit",
                                                        day: "2-digit",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    }).format(new Date(err.createdAt))}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* Expanded Error Details */}
                                {expandedError && (
                                    <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-4 bg-red-50 dark:bg-red-900/10">
                                        {(() => {
                                            const err = syncErrors.recentErrors.find(
                                                (e) => e.id === expandedError
                                            );
                                            return err ? (
                                                <div className="space-y-2">
                                                    <div>
                                                        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                                                            Error Message:
                                                        </p>
                                                        <p className="text-xs text-red-600 dark:text-red-400 break-words font-mono">
                                                            {err.errorMessage}
                                                        </p>
                                                    </div>
                                                    {err.stackTrace && (
                                                        <div>
                                                            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                                                                Stack Trace:
                                                            </p>
                                                            <pre className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 p-2 rounded overflow-auto max-h-48 font-mono">
                                                                {err.stackTrace}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                                        Expires:{" "}
                                                        {new Intl.DateTimeFormat("es-ES", {
                                                            year: "numeric",
                                                            month: "2-digit",
                                                            day: "2-digit",
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        }).format(new Date(err.expiresAt))}
                                                    </p>
                                                </div>
                                            ) : null;
                                        })()}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="px-4 py-12 text-center text-zinc-500 dark:text-zinc-400">
                                No sync errors recorded.
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
