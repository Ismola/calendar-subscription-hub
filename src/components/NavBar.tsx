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
