import Link from 'next/link';
import { ContactForm } from '../components/contact-form';
import { SiteHeader } from '../components/site-header';

const secondarySolutions = [
  {
    label: 'AI',
    title: 'AI в контуре вашей компании',
    text: 'Ассистенты для базы знаний, документов и поддержки — с контролируемыми источниками и понятной ролью человека.',
    href: '/solutions/ai',
    accent: 'from-violet-500 to-blue-500',
    icon: '✦',
  },
  {
    label: 'Cloud',
    title: 'Надёжная облачная среда',
    text: 'Размещение 1С и сервисов, резервное копирование, мониторинг, безопасный доступ и план восстановления.',
    href: '/solutions/cloud',
    accent: 'from-cyan-500 to-blue-500',
    icon: '☁',
  },
  {
    label: 'Integrations',
    title: 'Системы работают вместе',
    text: 'Связываем 1С с сайтами, Jira, маркетплейсами, банками, API и ЭДО без повторного ввода данных.',
    href: '/solutions/integrations',
    accent: 'from-emerald-500 to-cyan-500',
    icon: '⌁',
  },
  {
    label: 'Agent+',
    title: 'Продажи всегда в движении',
    text: 'Маршруты, заказы, цены, остатки и задачи торгового представителя с двусторонним обменом с 1С.',
    href: '/solutions/agent-plus',
    accent: 'from-orange-500 to-rose-500',
    icon: '↗',
  },
];

const capabilities = [
  ['01', 'Обследование', 'Разбираем процессы, роли, документы и данные. Формируем понятную карту изменений.'],
  ['02', 'Внедрение', 'Настраиваем типовые решения 1С и дорабатываем только там, где это даёт бизнес-эффект.'],
  ['03', 'Интеграции', 'Строим устойчивый обмен с внешними системами, контролем ошибок и журналированием.'],
  ['04', 'Развитие', 'Поддерживаем пользователей, управляем очередью задач и планомерно развиваем систему.'],
];

const outcomes = [
  ['Единые данные', 'Продажи, склад, финансы и управление опираются на согласованную информацию.'],
  ['Меньше ручной работы', 'Повторяемые операции автоматизированы, а сотрудники занимаются задачами, где нужен опыт.'],
  ['Прозрачные процессы', 'Понятно, где находится документ, кто отвечает за следующий шаг и что требует внимания.'],
];

const industries = ['Оптовая торговля', 'Дистрибуция и FMCG', 'Производство', 'Профессиональные услуги'];

function Arrow({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function OneCSystemVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[590px]">
      <div className="absolute -inset-8 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/90 p-4 shadow-2xl shadow-black/40 backdrop-blur sm:p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <span className="rounded-full bg-blue-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">
            Иллюстрация контура
          </span>
        </div>
        <div className="grid gap-3 pt-4 sm:grid-cols-[0.72fr_1.28fr]">
          <div className="rounded-2xl bg-white/[0.05] p-4">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 font-black text-slate-950">1С</span>
              <div>
                <p className="text-sm font-bold text-white">Контур учёта</p>
                <p className="text-xs text-slate-500">единое ядро</p>
              </div>
            </div>
            <div className="space-y-2">
              {['Продажи', 'Склад', 'Финансы', 'Закупки'].map((item, index) => (
                <div key={item} className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs ${index === 0 ? 'bg-blue-500 text-white' : 'text-slate-400'}`}>
                  <span>{item}</span><span>›</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4 text-slate-950">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Заказы</p>
                <p className="mt-3 text-lg font-black">Единый поток</p>
                <p className="mt-1 text-xs font-bold text-emerald-600">статусы под контролем</p>
              </div>
              <div className="rounded-2xl bg-blue-500 p-4 text-white">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-100">Операции</p>
                <p className="mt-3 text-lg font-black">Автоматизация</p>
                <p className="mt-1 text-xs text-blue-100">меньше ручного ввода</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white/[0.06] p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-white">Обмен данными</p>
                <p className="text-[10px] text-slate-500">мониторинг</p>
              </div>
              <div className="mt-4 flex items-end gap-1.5">
                {[38, 55, 44, 72, 59, 84, 68, 96, 76, 88, 100, 84].map((height, index) => (
                  <span key={index} className="flex-1 rounded-t bg-gradient-to-t from-blue-600 to-cyan-400" style={{ height: `${height * 0.42}px` }} />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {['Сайт', 'Jira', 'Agent+', 'ЭДО'].map((item) => (
                  <span key={item} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300">{item}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-800 px-4 py-3 shadow-xl sm:-left-8">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/20 text-violet-300">✦</span>
        <div><p className="text-xs font-bold text-white">AI-помощник</p><p className="text-[10px] text-slate-400">помогает разбирать ошибки</p></div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main id="top" className="overflow-hidden bg-white text-slate-950">
      <SiteHeader />

      <section className="relative isolate min-h-[760px] overflow-hidden bg-[#07101f] text-white">
        <div className="landing-grid absolute inset-0 opacity-30" />
        <div className="absolute left-1/2 top-0 h-[650px] w-[650px] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[130px]" />
        <div className="absolute -right-48 bottom-0 h-[480px] w-[480px] rounded-full bg-cyan-500/10 blur-[100px]" />
        <div className="relative mx-auto grid max-w-7xl gap-16 px-6 py-20 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-28">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_#34d399]" />
              Автоматизация бизнеса на базе 1С
            </div>
            <h1 className="mt-8 max-w-3xl text-5xl font-black leading-[0.96] tracking-[-0.05em] sm:text-6xl lg:text-[5.2rem]">
              1С, которая
              <span className="block bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                двигает бизнес
              </span>
              вперёд
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
              Внедряем и развиваем 1С, соединяем её с AI, облаком и внешними сервисами. Один технологический партнёр — от диагностики до поддержки.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href="#contact" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-blue-500 px-7 font-black text-white shadow-xl shadow-blue-600/30 transition hover:-translate-y-0.5 hover:bg-blue-400">
                Обсудить проект <Arrow />
              </a>
              <Link href="/solutions/1c" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full border border-white/15 bg-white/[0.06] px-7 font-bold text-white transition hover:bg-white/10">
                Как мы внедряем 1С
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-slate-400">
              {['Поэтапный запуск', 'Без остановки бизнеса', 'Поддержка после внедрения'].map((item) => (
                <span key={item} className="flex items-center gap-2"><span className="text-emerald-400"><Check /></span>{item}</span>
              ))}
            </div>
          </div>
          <OneCSystemVisual />
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-7 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Единый цифровой контур</p>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-black text-slate-700 sm:gap-x-12">
            {['1С:Предприятие', 'AI & RAG', 'Cloud', 'Agent+', 'API & ЭДО'].map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      </section>

      <section id="solutions" className="bg-slate-50 py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="eyebrow">1С — основа решений</p>
              <h2 className="section-title mt-4">Не просто настройка. Рабочая система управления.</h2>
            </div>
            <p className="max-w-2xl text-lg leading-8 text-slate-600 lg:justify-self-end">
              Начинаем с реального процесса компании, а не с перечня функций. Сохраняем сильные стороны типового решения и добавляем ровно те изменения, которые нужны бизнесу.
            </p>
          </div>

          <div className="mt-14 grid overflow-hidden rounded-[2rem] border border-slate-200 bg-white lg:grid-cols-4">
            {capabilities.map(([number, title, text], index) => (
              <article key={title} className={`relative p-7 lg:min-h-[300px] ${index < capabilities.length - 1 ? 'border-b border-slate-200 lg:border-b-0 lg:border-r' : ''}`}>
                <span className="text-xs font-black tracking-[0.18em] text-blue-600">{number}</span>
                <h3 className="mt-10 text-2xl font-black tracking-tight">{title}</h3>
                <p className="mt-4 leading-7 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <Link href="/solutions/1c" className="inline-flex items-center gap-2 font-black text-blue-600 transition hover:gap-3">Подробнее о 1С <Arrow /></Link>
          </div>
        </div>
      </section>

      <section className="bg-[#07101f] py-24 text-white sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Больше возможностей</p>
            <h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.04em] sm:text-6xl">Усиливаем 1С современными технологиями</h2>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {secondarySolutions.map((item) => (
              <Link href={item.href} key={item.label} className="group relative min-h-[330px] overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] p-7 transition hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07] sm:p-9">
                <div className={`absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gradient-to-br ${item.accent} opacity-15 blur-3xl transition group-hover:opacity-25`} />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-start justify-between">
                    <span className={`grid h-13 w-13 place-items-center rounded-2xl bg-gradient-to-br ${item.accent} text-xl font-black shadow-lg`}>{item.icon}</span>
                    <span className="grid h-11 w-11 place-items-center rounded-full border border-white/10 text-slate-400 transition group-hover:border-white/20 group-hover:text-white"><Arrow /></span>
                  </div>
                  <p className="mt-10 text-xs font-black uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                  <h3 className="mt-3 text-3xl font-black tracking-tight">{item.title}</h3>
                  <p className="mt-4 max-w-xl text-base leading-7 text-slate-400">{item.text}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="approach" className="py-24 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="eyebrow">Результат для бизнеса</p>
            <h2 className="section-title mt-4">Технологии должны упрощать работу</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Оцениваем успех проекта не количеством доработок, а тем, насколько быстрее и точнее работает компания.</p>
            <div className="mt-8 flex flex-wrap gap-2">
              {industries.map((industry) => <span key={industry} className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-600">{industry}</span>)}
            </div>
          </div>
          <div className="space-y-3">
            {outcomes.map(([title, text], index) => (
              <article key={title} className="group grid gap-5 rounded-2xl border border-slate-200 p-6 transition hover:border-blue-200 hover:bg-blue-50/40 sm:grid-cols-[64px_1fr] sm:items-start">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-lg font-black text-white transition group-hover:bg-blue-600">0{index + 1}</span>
                <div><h3 className="text-xl font-black">{title}</h3><p className="mt-2 leading-7 text-slate-600">{text}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="relative overflow-hidden bg-slate-100 py-24 sm:py-28">
        <div className="absolute left-0 top-0 h-96 w-96 rounded-full bg-blue-300/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="eyebrow">Первый шаг</p>
            <h2 className="section-title mt-4">Обсудим, где 1С может работать лучше</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              Опишите текущую задачу. На первой встрече разберём контекст, определим приоритет и предложим реалистичный следующий шаг.
            </p>
            <div className="mt-9 space-y-4">
              {['Разберём процесс и ограничения', 'Определим ожидаемый результат', 'Предложим формат первого этапа'].map((item) => (
                <div key={item} className="flex items-center gap-3 font-bold text-slate-800">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-blue-600 shadow-sm"><Check /></span>{item}
                </div>
              ))}
            </div>
          </div>
          <ContactForm />
        </div>
      </section>

      <footer className="bg-[#07101f] text-slate-400">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.3fr_0.7fr_0.7fr]">
          <div className="max-w-md">
            <p className="text-2xl font-black text-white">Avantime<span className="text-blue-500">.</span></p>
            <p className="mt-4 leading-7">Внедрение 1С, AI, облачные решения и интеграции для устойчивой автоматизации бизнеса.</p>
          </div>
          <div><p className="font-black text-white">Решения</p><div className="mt-4 space-y-3 text-sm"><Link className="block hover:text-white" href="/solutions/1c">Внедрение 1С</Link><Link className="block hover:text-white" href="/solutions/ai">AI для бизнеса</Link><Link className="block hover:text-white" href="/solutions/agent-plus">Agent+</Link></div></div>
          <div><p className="font-black text-white">Компания</p><div className="mt-4 space-y-3 text-sm"><Link className="block hover:text-white" href="/knowledge">База знаний</Link><Link className="block hover:text-white" href="/assistant">AI-консультант</Link><Link className="block hover:text-white" href="/portal">Кабинет клиента</Link></div></div>
        </div>
        <div className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-6 text-xs sm:flex-row sm:justify-between"><span>© 2026 Avantime</span><span>1С · AI · Cloud · Integrations · Agent+</span></div></div>
      </footer>
    </main>
  );
}
