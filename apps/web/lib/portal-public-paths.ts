export const PORTAL_PUBLIC_PATHS = [
  '/portal/login',
  '/portal/forgot-password',
  '/portal/reset-password',
] as const;

export function isPortalPublicPath(pathname: string): boolean {
  return (PORTAL_PUBLIC_PATHS as readonly string[]).includes(pathname);
}
