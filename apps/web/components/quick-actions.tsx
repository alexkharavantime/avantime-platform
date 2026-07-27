import Link from 'next/link';

const actions = [
  {
    href: '/dashboard/knowledge',
    title: 'Knowledge Center',
    text: 'Загрузить документы и работать с базой знаний.',
    icon: '▤',
  },
  {
    href: '/dashboard/ai',
    title: 'AI Chat',
    text: 'Задать вопрос AI-консультанту Avantime.',
    icon: '✦',
  },
  {
    href: '/dashboard/documents',
    title: 'Документы',
    text: 'Просмотреть загруженные и обработанные файлы.',
    icon: '▣',
  },
  {
    href: '/dashboard/support',
    title: 'Поддержка',
    text: 'Создать обращение и отслеживать его статус.',
    icon: '◎',
  },
];

export function QuickActions() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-xl text-blue-700">
            {action.icon}
          </span>

          <h3 className="mt-4 font-black text-slate-950">
            {action.title}
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            {action.text}
          </p>

          <span className="mt-4 inline-block text-sm font-bold text-blue-700">
            Открыть →
          </span>
        </Link>
      ))}
    </div>
  );
}