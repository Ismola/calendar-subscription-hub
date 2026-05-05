import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

const schema = z.object({
    email: z.email(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    displayName: z.string().min(1).max(100).optional(),
});

export async function POST(req: NextRequest) {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0].message },

            { status: 422 }
        );
    }

    const { email, password, displayName } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        return NextResponse.json(
            { error: "A user with that email already exists" },
            { status: 409 }
        );
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
        data: { email, passwordHash, displayName: displayName ?? null },
        select: { id: true, email: true, displayName: true, createdAt: true },
    });

    return NextResponse.json({ user }, { status: 201 });
}
