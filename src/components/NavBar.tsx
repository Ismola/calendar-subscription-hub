"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NavBar({ displayName, isAdmin }: { displayName: string; isAdmin: boolean }) {
    const router = useRouter();

    async function handleLogout() {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
    }

    return (
        <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
                <Link
                    href="/dashboard"
                    className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 hover:opacity-75 transition-opacity"
                >
                    Calendar Subscription Hub
                </Link>
                <div className="flex items-center gap-4">
                    <a
                        href="https://github.com/Ismola/calendar-subscription-hub"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="size-4 fill-current"
                        >
                            <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.24c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.28-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.96 10.96 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.06.79 2.14v3.18c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
                        </svg>
                        <span className="hidden sm:inline">GitHub</span>
                        <span className="sr-only sm:hidden">View on GitHub</span>
                    </a>
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin"
                            className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors font-medium"
                        >
                            Admin
                        </Link>
                    )}
                    <span className="text-sm text-zinc-500 dark:text-zinc-400 hidden sm:block">
                        {displayName}
                    </span>
                    <button
                        onClick={handleLogout}
                        className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                    >
                        Sign out
                    </button>
                </div>
            </div>
        </header>
    );
}
