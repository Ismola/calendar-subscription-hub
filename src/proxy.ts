import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/lib/env";
import { isPublicPath } from "@/lib/auth/public-path";

const COOKIE_NAME = "csh_session";

function secret(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret());
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rutas públicas: métricas, ICS por GUID, assets estáticos y auth
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const jwt = req.cookies.get(COOKIE_NAME)?.value;

  if (!jwt) {
    // API routes return 401, UI routes redirect to login
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    await jwtVerify(jwt, secret());
    return NextResponse.next();
  } catch {
    const isApi = pathname.startsWith("/api/");
    if (isApi) {
      const resp = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      resp.cookies.delete(COOKIE_NAME);
      return resp;
    }
    const resp = NextResponse.redirect(new URL("/login", req.url));
    resp.cookies.delete(COOKIE_NAME);
    return resp;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
