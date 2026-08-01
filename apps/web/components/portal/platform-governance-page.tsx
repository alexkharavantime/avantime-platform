import Link from 'next/link';

const routes = [
  ['/portal/platform', 'Обзор'],
  ['/portal/platform/roles', 'Platform-роли'],
  ['/portal/platform/audit', 'Глобальный аудит'],
  ['/portal/platform/support', 'Support-сессии'],
  ['/portal/platform/approvals', 'Подтверждения'],
  ['/portal/platform/operations', 'Операции'],
] as const;

export function PlatformGovernancePage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">{title}</h1>
      <p className="mt-3 max-w-3xl text-slate-600">{description}</p>
      <nav aria-label="Управление платформой" className="mt-8 flex flex-wrap gap-2">
        {routes.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700"
          >
            {label}
          </Link>
        ))}
      </nav>
      {children ? <div className="mt-8">{children}</div> : null}
    </div>
  );
}
