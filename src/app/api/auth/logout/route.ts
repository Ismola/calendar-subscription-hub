import { NextResponse } from "next/server";
import { deleteSession, cookieName } from "@/lib/auth/session";

export async function POST() {
    await deleteSession();
    const resp = NextResponse.json({ ok: true });
    resp.cookies.delete(cookieName());
    return resp;
}
