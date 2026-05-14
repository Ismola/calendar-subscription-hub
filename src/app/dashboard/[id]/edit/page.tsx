"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ProviderFieldDefinition } from "@/lib/providers/types";

interface Provider {
    key: string;
    name: string;
    description: string;
    defaultRefreshMinutes: number;
    fields: ProviderFieldDefinition[];
}

interface SubscriptionDetail {
    id: string;
    name: string;
    providerKey: string;
    providerName: string;
    refreshIntervalMinutes: number;
    config: Record<string, unknown>;
    editableConfig: Record<string, unknown>;
    secretConfiguredKeys: string[];
}

function toFieldString(value: unknown): string {
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return value;
    return "";
}

export default function EditSubscriptionPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const subscriptionId = params.id;

    const [providers, setProviders] = useState<Provider[]>([]);
    const [subscription, setSubscription] = useState<SubscriptionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState("");
    const [refreshInterval, setRefreshInterval] = useState<number>(60);
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const selectedProvider = useMemo(() => {
        if (!subscription) return null;
        return providers.find((p) => p.key === subscription.providerKey) ?? null;
    }, [providers, subscription]);

    useEffect(() => {
        if (!subscriptionId) return;

        async function load() {
            try {
                const [providersRes, subscriptionRes] = await Promise.all([
                    fetch("/api/providers"),
                    fetch(`/api/subscriptions/${subscriptionId}`),
                ]);

                const providersData = await providersRes.json();
                setProviders(providersData.providers ?? []);

                if (!subscriptionRes.ok) {
                    const data = await subscriptionRes.json();
                    setError(data.error ?? "Failed to load subscription");
                    return;
                }

                const subscriptionData = await subscriptionRes.json();
                const sub = subscriptionData.subscription as SubscriptionDetail;
                setSubscription(sub);
                setName(sub.name);
                setRefreshInterval(sub.refreshIntervalMinutes);

                const initialFieldValues: Record<string, string> = {};
                for (const [key, value] of Object.entries(sub.editableConfig ?? {})) {
                    initialFieldValues[key] = toFieldString(value);
                }
                setFieldValues(initialFieldValues);
            } catch {
                setError("Network error. Please try again.");
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [subscriptionId]);

    function setField(key: string, value: string) {
        setFieldValues((prev) => ({ ...prev, [key]: value }));
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!selectedProvider || !subscription) return;

        setSubmitting(true);
        setError(null);

        const config: Record<string, unknown> = {};
        const secretConfig: Record<string, unknown> = {};

        for (const field of selectedProvider.fields) {
            const value = fieldValues[field.key] ?? "";

            if (field.secret) {
                // Empty secret fields keep the currently stored encrypted value.
                if (value !== "") {
                    secretConfig[field.key] = value;
                }
            } else {
                config[field.key] = value;
            }
        }

        try {
            const res = await fetch(`/api/subscriptions/${subscription.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    refreshIntervalMinutes: refreshInterval,
                    config,
                    secretConfig: Object.keys(secretConfig).length ? secretConfig : undefined,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error ?? "Failed to update subscription");
                return;
            }

            router.push("/dashboard");
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24 text-zinc-400">
                Loading calendar...
            </div>
        );
    }

    if (!subscription || !selectedProvider) {
        return (
            <div className="max-w-xl space-y-4">
                <Link
                    href="/dashboard"
                    className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
                >
                    {"<- Back"}
                </Link>
                <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                    {error ?? "Subscription or provider not found."}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-xl space-y-6">
            <div className="flex items-center gap-3">
                <Link
                    href="/dashboard"
                    className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
                >
                    {"<- Back"}
                </Link>
                <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                    Edit calendar
                </h1>
            </div>

            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {subscription.providerName}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Provider cannot be changed after creating the calendar.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                        {error}
                    </div>
                )}

                <div className="space-y-1">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Calendar name
                    </label>
                    <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                    />
                </div>

                <div className="space-y-1">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Refresh interval (minutes)
                    </label>
                    <input
                        type="number"
                        min={5}
                        max={1440}
                        required
                        value={refreshInterval}
                        onChange={(e) => setRefreshInterval(parseInt(e.target.value, 10))}
                        className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                    />
                </div>

                {selectedProvider.fields.map((field) => {
                    return (
                        <div key={field.key} className="space-y-1">
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                {field.label}
                                {field.required && (
                                    <span className="ml-1 text-red-500">*</span>
                                )}
                                {field.secret && (
                                    <span className="ml-2 text-xs text-zinc-400">(encrypted)</span>
                                )}
                            </label>

                            {field.type === "select" && field.options ? (
                                <select
                                    required={field.required}
                                    value={fieldValues[field.key] ?? ""}
                                    onChange={(e) => setField(field.key, e.target.value)}
                                    className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                                >
                                    <option value="">Select...</option>
                                    {field.options.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            ) : field.type === "boolean" ? (
                                <input
                                    type="checkbox"
                                    checked={fieldValues[field.key] === "true"}
                                    onChange={(e) =>
                                        setField(field.key, e.target.checked ? "true" : "false")
                                    }
                                    className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900"
                                />
                            ) : (
                                <input
                                    type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                                    required={field.required}
                                    placeholder={field.placeholder}
                                    value={fieldValues[field.key] ?? ""}
                                    onChange={(e) => setField(field.key, e.target.value)}
                                    className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                                />
                            )}

                            {field.helpText && (
                                <p className="text-xs text-zinc-400">{field.helpText}</p>
                            )}
                        </div>
                    );
                })}

                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {submitting ? "Saving..." : "Save changes"}
                </button>
            </form>
        </div>
    );
}
