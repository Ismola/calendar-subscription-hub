"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ProviderFieldDefinition } from "@/lib/providers/types";

interface Provider {
    key: string;
    name: string;
    description: string;
    defaultRefreshMinutes: number;
    fields: ProviderFieldDefinition[];
}

export default function NewSubscriptionPage() {
    const router = useRouter();
    const [providers, setProviders] = useState<Provider[]>([]);
    const [loadingProviders, setLoadingProviders] = useState(true);
    const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
    const [name, setName] = useState("");
    const [refreshInterval, setRefreshInterval] = useState<number>(60);
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetch("/api/providers")
            .then((r) => r.json())
            .then((d) => setProviders(d.providers ?? []))
            .finally(() => setLoadingProviders(false));
    }, []);

    function selectProvider(p: Provider) {
        setSelectedProvider(p);
        setRefreshInterval(p.defaultRefreshMinutes);
        setFieldValues({});
        setError(null);
    }

    function setField(key: string, value: string) {
        setFieldValues((prev) => ({ ...prev, [key]: value }));
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!selectedProvider) return;
        setSubmitting(true);
        setError(null);

        const config: Record<string, unknown> = {};
        const secretConfig: Record<string, unknown> = {};

        for (const field of selectedProvider.fields) {
            const value = fieldValues[field.key] ?? "";
            if (field.secret) {
                secretConfig[field.key] = value;
            } else {
                config[field.key] = value;
            }
        }

        try {
            const res = await fetch("/api/subscriptions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    providerKey: selectedProvider.key,
                    config,
                    secretConfig: Object.keys(secretConfig).length ? secretConfig : undefined,
                    refreshIntervalMinutes: refreshInterval,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error ?? "Failed to create subscription");
                return;
            }

            router.push("/dashboard");
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    if (loadingProviders) {
        return (
            <div className="flex items-center justify-center py-24 text-zinc-400">
                Loading providers…
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
                    ← Back
                </Link>
                <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                    New calendar
                </h1>
            </div>

            {/* Provider catalogue */}
            <section className="space-y-3">
                <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Choose a provider
                </h2>

                {providers.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center">
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            No providers available yet.
                        </p>
                        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                            Providers will appear here once they are configured.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-2">
                        {providers.map((p) => (
                            <button
                                key={p.key}
                                onClick={() => selectProvider(p)}
                                className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${selectedProvider?.key === p.key
                                        ? "border-zinc-900 dark:border-zinc-50 bg-zinc-50 dark:bg-zinc-800"
                                        : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-500"
                                    }`}
                            >
                                <p className="font-medium text-sm text-zinc-900 dark:text-zinc-50">
                                    {p.name}
                                </p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    {p.description}
                                </p>
                            </button>
                        ))}
                    </div>
                )}
            </section>

            {/* Configuration form */}
            {selectedProvider && (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Configure {selectedProvider.name}
                    </h2>

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
                            placeholder="My calendar"
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

                    {/* Dynamic provider fields */}
                    {selectedProvider.fields.map((field) => (
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
                                    <option value="">Select…</option>
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
                    ))}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {submitting ? "Creating…" : "Create calendar"}
                    </button>
                </form>
            )}
        </div>
    );
}
