const ADMIN_DOMAIN = "ismola.dev";

export function isAdminEmail(email: string): boolean {
    return email.trim().toLowerCase().endsWith(`@${ADMIN_DOMAIN}`);
}
