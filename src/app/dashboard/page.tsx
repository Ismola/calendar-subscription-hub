"use client";

import { useEffect, useMemo, useState } from "react";
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

interface CalendarEvent {
    id: string;
    subscriptionId: string;
    subscriptionName: string;
    providerName: string;
    title: string;
    description: string;
    startsAt: string;
    endsAt: string | null;
    allDay: boolean;
}

type ViewMode = "list" | "calendar";

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SUBSCRIPTION_TUTORIALS = [
    {
        id: "apple",
        title: "Apple Calendar",
        subtitle: "iOS / iPadOS / macOS",
        steps: [
            { id: "open-settings", text: "Open Settings (iPhone/iPad) or Calendar settings (Mac)." },
            { id: "add-account", text: "Go to Accounts → Add account → Other → Subscribed Calendar." },
            { id: "paste-url", text: "Paste your ICS URL and save." },
        ],
    },
    {
        id: "google",
        title: "Google Calendar",
        subtitle: "Android / Web",
        steps: [
            { id: "open-web", text: "Open Google Calendar on web (desktop browser)." },
            { id: "from-url", text: "In Other calendars, choose From URL." },
            { id: "add-calendar", text: "Paste your ICS URL and add calendar (syncs to Android too)." },
        ],
    },
    {
        id: "outlook",
        title: "Outlook",
        subtitle: "Windows / macOS",
        steps: [
            { id: "open-outlook-calendar", text: "Open Outlook Calendar." },
            { id: "subscribe", text: "Choose Add calendar → Subscribe from web." },
            { id: "confirm", text: "Paste your ICS URL and confirm." },
        ],
    },
    {
        id: "thunderbird",
        title: "Thunderbird",
        subtitle: "Linux / Desktop",
        steps: [
            { id: "open-thunderbird-calendar", text: "Open Calendar in Thunderbird." },
            { id: "network", text: "Create a new network calendar." },
            { id: "ical", text: "Select iCalendar (ICS), paste your URL, and finish." },
        ],
    },
] as const;

function toDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getEventDateKeys(event: CalendarEvent): string[] {
    const start = new Date(event.startsAt);
    const end = event.endsAt ? new Date(event.endsAt) : new Date(event.startsAt);

    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);

    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);

    const dateKeys: string[] = [];
    while (cursor <= endDay) {
        dateKeys.push(toDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    return dateKeys;
}

function getMonthGrid(monthBase: Date) {
    const monthStart = new Date(monthBase.getFullYear(), monthBase.getMonth(), 1);
    const offsetToMonday = (monthStart.getDay() + 6) % 7;
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - offsetToMonday);

    return Array.from({ length: 42 }, (_, index) => {
        const day = new Date(gridStart);
        day.setDate(gridStart.getDate() + index);
        return day;
    });
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

function TutorialIcon({ platformId }: { platformId: string }) {
    if (platformId === "apple") {
        return (
            <svg viewBox="0 0 24 24" className="h-10 w-10 text-zinc-900 dark:text-zinc-100" fill="none" aria-hidden="true">
                <rect x="5" y="2" width="14" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="18" r="1.2" fill="currentColor" />
                <path d="M9 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        );
    }

    if (platformId === "google") {
        return (
            <svg viewBox="0 0 24 24" className="h-10 w-10 text-zinc-900 dark:text-zinc-100" fill="none" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="12" cy="14" r="2" fill="currentColor" />
            </svg>
        );
    }

    if (platformId === "outlook") {
        return (
            <svg viewBox="0 0 24 24" className="h-10 w-10 text-zinc-900 dark:text-zinc-100" fill="none" aria-hidden="true">
                <rect x="3" y="5" width="9" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <rect x="12" y="4" width="9" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M15 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 24 24" className="h-10 w-10 text-zinc-900 dark:text-zinc-100" fill="none" aria-hidden="true">
            <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="17" cy="17" r="1.2" fill="currentColor" />
        </svg>
    );
}

export default function DashboardPage() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [calendarLoading, setCalendarLoading] = useState(false);
    const [calendarWarnings, setCalendarWarnings] = useState<string[]>([]);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [refreshingIds, setRefreshingIds] = useState<Record<string, boolean>>({});
    const [view, setView] = useState<ViewMode>("list");
    const [monthCursor, setMonthCursor] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });
    const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/subscriptions")
            .then((r) => r.json())
            .then((d) => setSubscriptions(d.subscriptions ?? []))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (view !== "calendar") return;

        const monthDays = getMonthGrid(monthCursor);
        const firstDay = new Date(monthDays[0]);
        firstDay.setHours(0, 0, 0, 0);

        const lastDay = new Date(monthDays[monthDays.length - 1]);
        lastDay.setHours(23, 59, 59, 999);

        fetch(
            `/api/calendar/events?start=${encodeURIComponent(
                firstDay.toISOString()
            )}&end=${encodeURIComponent(lastDay.toISOString())}`
        )
            .then(async (r) => {
                const data = await r.json();
                if (!r.ok) {
                    throw new Error(data.error ?? "Failed to load calendar events");
                }
                return data;
            })
            .then((d) => {
                setCalendarEvents(d.events ?? []);
                setCalendarWarnings(d.warnings ?? []);
            })
            .catch((err: unknown) => {
                const message = err instanceof Error ? err.message : "Failed to load calendar events";
                setCalendarEvents([]);
                setCalendarWarnings([message]);
            })
            .finally(() => setCalendarLoading(false));
    }, [monthCursor, view]);

    const eventsByDay = useMemo(() => {
        const grouped = new Map<string, CalendarEvent[]>();

        for (const event of calendarEvents) {
            for (const dateKey of getEventDateKeys(event)) {
                const existing = grouped.get(dateKey) ?? [];
                existing.push(event);
                grouped.set(dateKey, existing);
            }
        }

        for (const dayEvents of grouped.values()) {
            dayEvents.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        }

        return grouped;
    }, [calendarEvents]);

    const monthDays = useMemo(() => getMonthGrid(monthCursor), [monthCursor]);

    const selectedDayEvents = useMemo(() => {
        if (!selectedDayKey) return [];
        return eventsByDay.get(selectedDayKey) ?? [];
    }, [selectedDayKey, eventsByDay]);

    const monthLabel = useMemo(
        () =>
            new Intl.DateTimeFormat("en-US", {
                month: "long",
                year: "numeric",
            }).format(monthCursor),
        [monthCursor]
    );

    async function handleDelete(id: string) {
        if (!confirm("Delete this subscription? This cannot be undone.")) return;
        await fetch(`/api/subscriptions/${id}`, { method: "DELETE" });
        setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    }

    async function handleRefresh(id: string) {
        setRefreshingIds((prev) => ({ ...prev, [id]: true }));
        try {
            await fetch(`/api/subscriptions/${id}/refresh`, { method: "POST" });
        } finally {
            setRefreshingIds((prev) => ({ ...prev, [id]: false }));
        }
    }

    async function copyUrl(id: string, url: string) {
        await navigator.clipboard.writeText(url);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    }

    function moveMonth(step: number) {
        setCalendarLoading(true);
        setMonthCursor(
            (prev) => new Date(prev.getFullYear(), prev.getMonth() + step, 1)
        );
        setSelectedDayKey(null);
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
                <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-md border border-zinc-200 dark:border-zinc-700 p-0.5 bg-white dark:bg-zinc-900">
                        <button
                            onClick={() => setView("list")}
                            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${view === "list"
                                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                }`}
                        >
                            List
                        </button>
                        <button
                            onClick={() => {
                                setCalendarLoading(true);
                                setView("calendar");
                            }}
                            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${view === "calendar"
                                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                }`}
                        >
                            Calendar
                        </button>
                    </div>
                    <Link
                        href="/dashboard/new"
                        className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
                    >
                        + New calendar
                    </Link>
                </div>
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
            ) : view === "list" ? (
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
                                    {refreshingIds[sub.id] && (
                                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                                            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                                            Updating calendar for this user...
                                        </p>
                                    )}
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
                                    <Link
                                        href={`/dashboard/${sub.id}/edit`}
                                        title="Edit"
                                        className="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                    >
                                        Edit
                                    </Link>
                                    <button
                                        onClick={() => handleRefresh(sub.id)}
                                        disabled={Boolean(refreshingIds[sub.id])}
                                        title={refreshingIds[sub.id] ? "Refreshing..." : "Force refresh"}
                                        className="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {refreshingIds[sub.id] ? (
                                            <span className="inline-flex items-center gap-1">
                                                <span className="inline-block animate-spin">↻</span>
                                                Updating...
                                            </span>
                                        ) : (
                                            <span className="inline-block">↻</span>
                                        )}
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
                       <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                            How to add your subscribed calendar
                        </h2>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Copy any ICS URL below and follow the steps for your operating system.
                        </p>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {SUBSCRIPTION_TUTORIALS.map((tutorial) => (
                                <article
                                    key={tutorial.id}
                                    className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-3"
                                >
                                    <div className="flex items-center gap-3">
                                        <TutorialIcon platformId={tutorial.id} />
                                        <div>
                                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                                {tutorial.title}
                                            </p>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                                {tutorial.subtitle}
                                            </p>
                                        </div>
                                    </div>
                                    <ol className="mt-3 space-y-1">
                                        {tutorial.steps.map((step, index) => (
                                            <li key={`${tutorial.id}-${step.id}`} className="flex gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                                                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800 text-[10px] font-semibold text-zinc-700 dark:text-zinc-200">
                                                    {index + 1}
                                                </span>
                                                <span>{step.text}</span>
                                            </li>
                                        ))}
                                    </ol>
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <button
                                onClick={() => moveMonth(-1)}
                                className="rounded border border-zinc-200 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                                Prev
                            </button>
                            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                                {monthLabel}
                            </p>
                            <button
                                onClick={() => moveMonth(1)}
                                className="rounded border border-zinc-200 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                                Next
                            </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                            {WEEK_DAYS.map((day) => (
                                <div key={day} className="px-1 py-1 text-center">
                                    {day}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                            {monthDays.map((day) => {
                                const dayKey = toDateKey(day);
                                const inCurrentMonth = day.getMonth() === monthCursor.getMonth();
                                const dayEvents = eventsByDay.get(dayKey) ?? [];
                                const isSelected = selectedDayKey === dayKey;

                                return (
                                    <button
                                        key={dayKey}
                                        onClick={() => setSelectedDayKey(dayKey)}
                                        className={`min-h-24 rounded-md border p-1.5 text-left transition-colors ${isSelected
                                            ? "border-zinc-900 dark:border-zinc-100 bg-zinc-100 dark:bg-zinc-800"
                                            : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                            } ${inCurrentMonth
                                                ? "bg-white dark:bg-zinc-900"
                                                : "bg-zinc-50 text-zinc-400 dark:bg-zinc-950 dark:text-zinc-600"
                                            }`}
                                    >
                                        <div className="mb-1 text-xs font-medium">{day.getDate()}</div>
                                        <div className="space-y-1">
                                            {dayEvents.slice(0, 2).map((event) => (
                                                <div
                                                    key={event.id}
                                                    className="truncate rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:text-zinc-300"
                                                >
                                                    {event.title}
                                                </div>
                                            ))}
                                            {dayEvents.length > 2 && (
                                                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 px-1">
                                                    +{dayEvents.length - 2} more
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                        {calendarLoading && (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                                Loading events...
                            </p>
                        )}
                        {calendarWarnings.length > 0 && (
                            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
                                {calendarWarnings.map((warning) => (
                                    <p key={warning}>{warning}</p>
                                ))}
                            </div>
                        )}
                        {selectedDayKey ? (
                            selectedDayEvents.length > 0 ? (
                                <div className="space-y-3">
                                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                        Events on {selectedDayKey}
                                    </p>
                                    {selectedDayEvents.map((event) => (
                                        <div
                                            key={event.id}
                                            className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                                    {event.title}
                                                </p>
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                                    {event.subscriptionName} · {event.providerName}
                                                </p>
                                                {event.description && (
                                                    <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                                                        {event.description}
                                                    </p>
                                                )}
                                            </div>
                                            <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                                                {event.allDay
                                                    ? "All day"
                                                    : new Intl.DateTimeFormat("en-US", {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    }).format(new Date(event.startsAt))}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                    No events for {selectedDayKey}.
                                </p>
                            )
                        ) : (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                Select a day to inspect events synced from your providers.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
