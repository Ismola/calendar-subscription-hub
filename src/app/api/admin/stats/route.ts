import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminEmail(session.email)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const totalUsers = await prisma.user.count();
    const totalSubscriptions = await prisma.calendarSubscription.count();
    const subscriptionsByStatus = await prisma.calendarSubscription.groupBy({
        by: ["status"],
        _count: true,
    });
    const subscriptionsBySyncStatus = await prisma.calendarSubscription.groupBy({
        by: ["syncStatus"],
        _count: true,
    });

    const users = await prisma.user.findMany({
        select: {
            id: true,
            email: true,
            displayName: true,
            createdAt: true,
            _count: {
                select: { subscriptions: true },
            },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
    });

    return NextResponse.json({
        stats: {
            totalUsers,
            totalSubscriptions,
            subscriptionsByStatus: Object.fromEntries(
                subscriptionsByStatus.map((item) => [item.status, item._count])
            ),
            subscriptionsBySyncStatus: Object.fromEntries(
                subscriptionsBySyncStatus.map((item) => [item.syncStatus, item._count])
            ),
        },
        users,
    });
}
