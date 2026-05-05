import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, cookieName, sessionCookieOptions } from "@/lib/auth/session";

const schema = z.object({
    email: z.email(),
    password: z.string().min(1),
});

const TTL_DAYS = 30;

export async function POST(req: NextRequest) {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 422 });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        // Constant-time response to avoid user enumeration
        await verifyPassword(password, "$2b$12$invalidhashfortimingprotection00000000000000000");
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const jwt = await createSession(user.id);
    const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

    const resp = NextResponse.json({
        user: { id: user.id, email: user.email, displayName: user.displayName },
    });
    resp.cookies.set(cookieName(), jwt, sessionCookieOptions(expiresAt));
    return resp;
}
