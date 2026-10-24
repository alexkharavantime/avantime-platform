export const PORTAL_PUBLIC_PATHS = [
  '/portal/login',
  '/portal/mfa-enrollment',
  '/portal/forgot-password',
  '/portal/reset-password',
  '/portal/request-access',
  '/portal/request-access/verify',
  '/portal/accept-invitation',
] as const;

export function isPortalPublicPath(pathname: string): boolean {
  return (PORTAL_PUBLIC_PATHS as readonly string[]).includes(pathname);
}
