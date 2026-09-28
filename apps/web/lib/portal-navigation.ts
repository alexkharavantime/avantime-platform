import { hasOrganizationPermission } from './organization-permissions';
import type { AppSession } from './session';
import { sessionHasPlatformPermission } from './platform-permissions';
import { defaultLocale, portalCopy, type Locale } from './i18n';

export type PortalNavigationItem = {
  href: string;
  label: string;
  exact: boolean;
  emphasized?: boolean;
};

export function buildPortalNavigation(
  session: AppSession | null,
  locale: Locale = defaultLocale,
): PortalNavigationItem[] {
  if (!session) return [];
  const copy = portalCopy[locale].nav;
  const items: PortalNavigationItem[] = [];
  if (hasOrganizationPermission(session, 'organization.view')) {
    items.push({ href: '/portal', label: copy.home, exact: true });
  }
  if (hasOrganizationPermission(session, 'requests.view')) {
    items.push({ href: '/portal/requests', label: copy.requests, exact: false });
  }
  if (hasOrganizationPermission(session, 'documents.view')) {
    items.push({ href: '/portal/documents', label: copy.documents, exact: false });
  }
  if (hasOrganizationPermission(session, 'knowledge.view')) {
    items.push({ href: '/portal/knowledge', label: copy.knowledge, exact: false });
  }
  if (hasOrganizationPermission(session, 'organization.view')) {
    items.push({ href: '/portal/company', label: copy.company, exact: false });
  }
  if (hasOrganizationPermission(session, 'members.view')) {
    items.push({ href: '/portal/team', label: copy.team, exact: false });
  }
  if (hasOrganizationPermission(session, 'notifications.view')) {
    items.push({ href: '/portal/notifications', label: copy.notifications, exact: false });
  }
  if (
    hasOrganizationPermission(session, 'identity.sessions.manage_self') ||
    hasOrganizationPermission(session, 'identity.mfa.manage_self')
  ) {
    items.push({ href: '/portal/settings', label: copy.settings, exact: false });
  }
  if (sessionHasPlatformPermission(session, 'platform.view')) {
    items.push({
      href: '/portal/platform',
      label: copy.platform,
      exact: false,
      emphasized: true,
    });
  }
  if (hasOrganizationPermission(session, 'documents.manage')) {
    items.push({
      href: '/admin/documents',
      label: copy.documentsAdmin,
      exact: false,
      emphasized: true,
    });
  }
  return items;
}
