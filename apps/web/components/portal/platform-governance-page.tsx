import Link from 'next/link';
import { getLocale } from '../../lib/i18n-server';
import { localePath, portalCopy, type Locale } from '../../lib/i18n';

export const platformGovernanceCopy: Record<Locale, {
  overview: { eyebrow: string; title: string; description: string };
  roles: { eyebrow: string; title: string; description: string; notice: string; active: string; disabled: string };
  audit: { eyebrow: string; title: string; description: string; date: string };
  support: { eyebrow: string; title: string; description: string; empty: string; active: string; datePrefix: string; date: string };
  approvals: { eyebrow: string; title: string; description: string; empty: string; until: string; date: string };
  operations: { eyebrow: string; title: string; description: string };
}> = {
  lv: {
    overview: { eyebrow: 'Platformas pārvaldība', title: 'Platformas pārvaldība', description: 'Globālās lomas, audits, atbalsta sesijas un operacionālās vadīklas ir nodalītas no organizāciju tiesībām.' },
    roles: { eyebrow: 'Platformas pārvaldība', title: 'Platformas lomas', description: 'Platformas tvēruma lomas neveido dalību organizācijā un nepiešķir neierobežotu piekļuvi tenant datiem.', notice: 'PLATFORM_OWNER piešķiršana vai noņemšana notiek tikai ar kontrolētu apstiprinājumu.', active: 'Aktīvs', disabled: 'Atspējots' },
    audit: { eyebrow: 'Platformas pārvaldība', title: 'Globālais audits', description: 'Tikai lasāmi globālo darbību pierādījumi. Eksportam nepieciešams atsevišķs kontrolēts apstiprinājums.', date: 'lv-LV' },
    support: { eyebrow: 'Platformas pārvaldība', title: 'Atbalsta sesijas', description: 'Īslaicīgai piekļuvei vienai organizācijai nepieciešama MFA, nesena autentifikācija, pieteikums, pamatojums un precīzs atļauto tvērumu saraksts.', empty: 'Aktīvu atbalsta sesiju nav.', active: 'Aktīva', datePrefix: 'līdz', date: 'lv-LV' },
    approvals: { eyebrow: 'Platformas pārvaldība', title: 'Kontrolēti apstiprinājumi', description: 'Pieprasītājs un apstiprinātājs ir nodalīti; apstiprinājumu ierobežo laiks, payload nospiedums un vienreizēja izpilde.', empty: 'Aktīvu pieprasījumu nav.', until: 'līdz', date: 'lv-LV' },
    operations: { eyebrow: 'Platformas pārvaldība', title: 'Operacionālās darbības', description: 'Rindas, dokumentu apstrāde un sistēmas stāvokļa vadīklas izmanto platformas operatora tiesības, nevis organizācijas administratora lomu.' },
  },
  ru: {
    overview: { eyebrow: 'Управление платформой', title: 'Управление платформой', description: 'Глобальные роли, аудит, сессии поддержки и операционные средства управления отделены от прав организаций.' },
    roles: { eyebrow: 'Управление платформой', title: 'Роли платформы', description: 'Роли уровня платформы не создают членство в организации и не дают неограниченный доступ к данным tenant.', notice: 'Назначение и удаление PLATFORM_OWNER выполняются только через контролируемое подтверждение.', active: 'Активна', disabled: 'Отключена' },
    audit: { eyebrow: 'Управление платформой', title: 'Глобальный аудит', description: 'Доступны только для чтения свидетельства глобальных операций. Экспорт требует отдельного контролируемого подтверждения.', date: 'ru-RU' },
    support: { eyebrow: 'Управление платформой', title: 'Сессии поддержки', description: 'Для кратковременного доступа к одной организации нужны MFA, недавняя аутентификация, номер задачи, обоснование и точный список разрешённых прав.', empty: 'Активных сессий поддержки нет.', active: 'Активна', datePrefix: 'до', date: 'ru-RU' },
    approvals: { eyebrow: 'Управление платформой', title: 'Контролируемые подтверждения', description: 'Запрашивающий и подтверждающий разделены; срок действия, отпечаток данных и однократное выполнение ограничивают подтверждение.', empty: 'Активных запросов нет.', until: 'до', date: 'ru-RU' },
    operations: { eyebrow: 'Управление платформой', title: 'Операционные действия', description: 'Очереди, обработка документов и проверки состояния используют права оператора платформы, а не администратора организации.' },
  },
  en: {
    overview: { eyebrow: 'Platform governance', title: 'Platform governance', description: 'Global roles, audit, support sessions and operational controls are separate from organization permissions.' },
    roles: { eyebrow: 'Platform governance', title: 'Platform roles', description: 'Platform-scoped assignments do not create organization membership or unrestricted tenant-data access.', notice: 'Assigning or removing PLATFORM_OWNER requires controlled approval.', active: 'Active', disabled: 'Disabled' },
    audit: { eyebrow: 'Platform governance', title: 'Global audit', description: 'Read-only evidence for global operations. Export requires separate controlled approval.', date: 'en-GB' },
    support: { eyebrow: 'Platform governance', title: 'Support sessions', description: 'Short-lived access to one organization requires MFA, recent authentication, a ticket, justification and an exact allowlisted scope.', empty: 'No active support sessions.', active: 'Active', datePrefix: 'until', date: 'en-GB' },
    approvals: { eyebrow: 'Platform governance', title: 'Controlled approvals', description: 'Requester and approver are separated; approvals are bounded by time, payload fingerprint and single execution.', empty: 'No active requests.', until: 'until', date: 'en-GB' },
    operations: { eyebrow: 'Platform governance', title: 'Operational actions', description: 'Queues, document processing and health controls use platform-operator permissions, not organization administrator rights.' },
  },
};

const routes = [
  ['/portal/platform', 'Обзор'],
  ['/portal/platform/roles', 'Platform-роли'],
  ['/portal/platform/audit', 'Глобальный аудит'],
  ['/portal/platform/support', 'Support-сессии'],
  ['/portal/platform/approvals', 'Подтверждения'],
  ['/portal/platform/operations', 'Операции'],
  ['/portal/platform/access-requests', 'Заявки на доступ'],
] as const;

export async function PlatformGovernancePage({
  eyebrow,
  title,
  description,
  children,
  locale,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
  locale?: Locale;
}) {
  const activeLocale = locale ?? (await getLocale());
  const copy = portalCopy[activeLocale].accessRequests;
  const labels = [copy.overview, copy.roles, copy.audit, copy.support, copy.approvals, copy.operations, copy.accessRequests];
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">{title}</h1>
      <p className="mt-3 max-w-3xl text-slate-600">{description}</p>
      <nav aria-label={copy.navigationAria} className="mt-8 flex flex-wrap gap-2">
        {routes.map(([href], index) => (
          <Link
            key={href}
            href={localePath(activeLocale, href)}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700"
          >
            {labels[index]}
          </Link>
        ))}
      </nav>
      {children ? <div className="mt-8">{children}</div> : null}
    </div>
  );
}
