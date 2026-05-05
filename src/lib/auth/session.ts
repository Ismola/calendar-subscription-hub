import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { createHash, randomBytes } from "crypto";

const COOKIE_NAME = "csh_session";
const SESSION_TTL_DAYS = 30;

function secret(): Uint8Array {
    const s = process.env.SESSION_SECRET;
    if (!s) throw new Error("Missing SESSION_SECRET");
    return new TextEncoder().encode(s);
}

function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(
        Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    await prisma.session.create({
        data: { tokenHash, userId, expiresAt },
    });

    const jwt = await new SignJWT({ sub: userId, tok: token })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime(`${SESSION_TTL_DAYS}d`)
        .setIssuedAt()
        .sign(secret());

    return jwt;
}

export async function getSession(): Promise<{
    userId: string;
    email: string;
    displayName: string | null;
} | null> {
    const store = await cookies();
    const jwt = store.get(COOKIE_NAME)?.value;
    if (!jwt) return null;

    try {
        const { payload } = await jwtVerify(jwt, secret());
        const token = payload["tok"] as string;
        if (!token) return null;

        const tokenHash = hashToken(token);
        const session = await prisma.session.findUnique({
            where: { tokenHash },
            include: { user: { select: { id: true, email: true, displayName: true } } },
        });

        if (!session || session.expiresAt < new Date()) {
            if (session) {
                await prisma.session.delete({ where: { id: session.id } });
            }
            return null;
        }

        return {
            userId: session.user.id,
            email: session.user.email,
            displayName: session.user.displayName,
        };
    } catch {
        return null;
    }
}

export async function deleteSession(): Promise<void> {
    const store = await cookies();
    const jwt = store.get(COOKIE_NAME)?.value;
    if (jwt) {
        try {
            const { payload } = await jwtVerify(jwt, secret());
            const token = payload["tok"] as string;
            if (token) {
                await prisma.session.deleteMany({
                    where: { tokenHash: hashToken(token) },
                });
            }
        } catch {
            // invalid token – just clear the cookie
        }
    }
}

export function cookieName(): string {
    return COOKIE_NAME;
}

export function sessionCookieOptions(expiresAt: Date) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
        expires: expiresAt,
    };
}
