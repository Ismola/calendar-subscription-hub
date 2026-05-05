import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import NavBar from "@/components/NavBar";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();
    if (!session) redirect("/login");

    return (
        <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
            <NavBar displayName={session.displayName ?? session.email} />
            <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8">
                {children}
            </main>
        </div>
    );
}
