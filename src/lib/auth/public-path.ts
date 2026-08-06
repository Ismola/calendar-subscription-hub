const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/_next",
  "/favicon",
];

const ICS_GUID_PATH =
  /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/api/metrics" ||
    PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    ICS_GUID_PATH.test(pathname)
  );
}
