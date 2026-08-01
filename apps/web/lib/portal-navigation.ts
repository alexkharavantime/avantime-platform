import { hasOrganizationPermission } from './organization-permissions';
import type { AppSession } from './session';

export type PortalNavigationItem = {
  href: string;
  label: string;
  exact: boolean;
  emphasized?: boolean;
};

export function buildPortalNavigation(session: AppSession | null): PortalNavigationItem[] {
  if (!session) return [];
  const items: PortalNavigationItem[] = [];
  if (hasOrganizationPermission(session, 'organization.view')) {
    items.push({ href: '/portal', label: 'Главная', exact: true });
  }
  if (hasOrganizationPermission(session, 'requests.view')) {
    items.push({ href: '/portal/requests', label: 'Обращения', exact: false });
  }
  if (hasOrganizationPermission(session, 'documents.view')) {
    items.push({ href: '/portal/documents', label: 'Документы', exact: false });
  }
  if (hasOrganizationPermission(session, 'knowledge.view')) {
    items.push({ href: '/portal/knowledge', label: 'База знаний', exact: false });
  }
  if (hasOrganizationPermission(session, 'organization.view')) {
    items.push({ href: '/portal/company', label: 'Компания', exact: false });
  }
  if (hasOrganizationPermission(session, 'members.view')) {
    items.push({ href: '/portal/team', label: 'Команда', exact: false });
  }
  if (hasOrganizationPermission(session, 'notifications.view')) {
    items.push({ href: '/portal/notifications', label: 'Уведомления', exact: false });
  }
  if (
    hasOrganizationPermission(session, 'identity.sessions.manage_self') ||
    hasOrganizationPermission(session, 'identity.mfa.manage_self')
  ) {
    items.push({ href: '/portal/settings', label: 'Настройки', exact: false });
  }
  if (session.role === 'ADMIN') {
    items.push({
      href: '/admin',
      label: 'Администрирование платформы',
      exact: false,
      emphasized: true,
    });
  } else if (hasOrganizationPermission(session, 'documents.manage')) {
    items.push({
      href: '/admin/documents',
      label: 'Управление документами',
      exact: false,
      emphasized: true,
    });
  }
  return items;
}
