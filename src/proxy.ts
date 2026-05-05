import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "csh_session";

const PUBLIC_PATHS = ["/login", "/register", "/api/auth/login", "/api/auth/register"];

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("Missing SESSION_SECRET");
  return new TextEncoder().encode(s);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rutas públicas: ICS por GUID, assets estáticos y auth
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    // ICS guid route: /xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      pathname
    )
  ) {
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
