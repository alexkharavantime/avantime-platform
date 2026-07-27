import Link from 'next/link';

const actions = [
  {
    href: '/dashboard/knowledge',
    title: 'Knowledge Center',
    text: 'Административная загрузка, поиск и работа с документами.',
    icon: '▤',
    available: true,
  },
  {
    href: '/dashboard/ai',
    title: 'AI Chat',
    text: 'Интерактивный AI-консультант готовится к следующему этапу.',
    icon: '✦',
    available: false,
  },
  {
    href: '/dashboard/documents',
    title: 'Документы',
    text: 'Клиентское хранилище документов пока не подключено.',
    icon: '▣',
    available: false,
  },
  {
    href: '/dashboard/support',
    title: 'Поддержка',
    text: 'Перейти к обращениям в действующем клиентском портале.',
    icon: '◎',
    available: true,
  },
];

export function QuickActions() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {actions.map((action) => {
        const content = (
          <>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-xl text-blue-700">
            {action.icon}
          </span>

          <h3 className="mt-4 font-black text-slate-950">
            {action.title}
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            {action.text}
          </p>

          <span className={`mt-4 inline-block text-sm font-bold ${action.available ? 'text-blue-700' : 'text-slate-500'}`}>
            {action.available ? 'Открыть →' : 'В разработке'}
          </span>
          </>
        );

        return action.available ? (
          <Link
            key={action.href}
            href={action.href}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg"
          >
            {content}
          </Link>
        ) : (
          <div key={action.href} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            {content}
          </div>
        );
      })}
    </div>
  );
}
