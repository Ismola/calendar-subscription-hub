import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { parseIcsEvents } from "@/lib/ics/parse";

const querySchema = z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
});

function intersectsRange(
    startsAt: Date,
    endsAt: Date | null,
    rangeStart: Date,
    rangeEnd: Date
) {
    const eventEnd = endsAt ?? startsAt;
    return startsAt <= rangeEnd && eventEnd >= rangeStart;
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = querySchema.safeParse(params);

    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? "Invalid query" },
            { status: 422 }
        );
    }

    const rangeStart = new Date(parsed.data.start);
    const rangeEnd = new Date(parsed.data.end);

    const subscriptions = await prisma.calendarSubscription.findMany({
        where: { userId: session.userId },
        include: {
            providerDefinition: {
                select: {
                    name: true,
                },
            },
            snapshots: {
                orderBy: { version: "desc" },
                take: 1,
                select: {
                    icsBody: true,
                },
            },
        },
    });

    const events = subscriptions.flatMap((subscription) => {
        const latestSnapshot = subscription.snapshots[0];
        if (!latestSnapshot?.icsBody) return [];

        return parseIcsEvents(latestSnapshot.icsBody)
            .filter((event) =>
                intersectsRange(event.startsAt, event.endsAt, rangeStart, rangeEnd)
            )
            .map((event) => ({
                id: `${subscription.id}:${event.uid}`,
                subscriptionId: subscription.id,
                subscriptionName: subscription.name,
                providerName: subscription.providerDefinition.name,
                title: event.summary,
                description: event.description,
                startsAt: event.startsAt.toISOString(),
                endsAt: event.endsAt?.toISOString() ?? null,
                allDay: event.allDay,
            }));
    });

    events.sort((a, b) =>
        a.startsAt === b.startsAt
            ? a.title.localeCompare(b.title)
            : a.startsAt.localeCompare(b.startsAt)
    );

    return NextResponse.json({ events });
}
