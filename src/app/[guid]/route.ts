import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRedisClient } from "@/lib/cache/redis";

const ICS_CACHE_TTL_SECONDS = 60;

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ guid: string }> }
) {
    const { guid } = await params;

    const sub = await prisma.calendarSubscription.findUnique({
        where: { publicId: guid },
        select: { id: true, name: true, status: true },
    });

    if (!sub) {
        return new NextResponse("Calendar not found", { status: 404 });
    }

    if (sub.status === "DISABLED") {
        return new NextResponse("Calendar is disabled", { status: 410 });
    }

    const cacheKey = `ics:${guid}`;
    try {
        const cachedIcs = await getRedisClient().get(cacheKey);
        if (cachedIcs) {
            return new NextResponse(cachedIcs, {
                status: 200,
                headers: {
                    "Content-Type": "text/calendar; charset=utf-8",
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Content-Disposition": `attachment; filename="${guid}.ics"`,
                    "X-Cache": "HIT",
                },
            });
        }
    } catch {
        // If Redis is unavailable, fall back to DB without failing the request.
    }

    const snapshot = await prisma.calendarSnapshot.findFirst({
        where: { subscriptionId: sub.id },
        orderBy: { version: "desc" },
        select: { icsBody: true },
    });

    const icsBody =
        snapshot?.icsBody ??
        [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            `PRODID:-//Calendar Subscription Hub//EN`,
            `X-WR-CALNAME:${sub.name}`,
            "END:VCALENDAR",
        ].join("\r\n");

    try {
        await getRedisClient().set(cacheKey, icsBody, "EX", ICS_CACHE_TTL_SECONDS);
    } catch {
        // If Redis is unavailable, still return the DB response.
    }

    return new NextResponse(icsBody, {
        status: 200,
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Content-Disposition": `attachment; filename="${guid}.ics"`,
            "X-Cache": "MISS",
        },
    });
}
