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

    const recentErrors = await prisma.syncError.findMany({
        include: {
            user: {
                select: {
                    id: true,
                    email: true,
                    displayName: true,
                },
            },
            subscription: {
                select: {
                    id: true,
                    name: true,
                    publicId: true,
                    providerDefinition: {
                        select: {
                            key: true,
                            name: true,
                        },
                    },
                },
            },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
    });

    // Count errors by user
    const errorsByUser = await prisma.syncError.groupBy({
        by: ["userId"],
        _count: true,
        orderBy: [{ _count: { userId: "desc" } }],
        take: 10,
    });

    // Get user details for errors by user
    const userIds = errorsByUser.map((e) => e.userId);
    const usersWithErrorCounts = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
            id: true,
            email: true,
            displayName: true,
        },
    });

    const errorsByUserWithDetails = errorsByUser.map((item) => {
        const user = usersWithErrorCounts.find((u) => u.id === item.userId);
        return {
            user,
            errorCount: item._count,
        };
    });

    return NextResponse.json({
        recentErrors,
        errorsByUser: errorsByUserWithDetails,
        totalErrors: await prisma.syncError.count(),
    });
}
