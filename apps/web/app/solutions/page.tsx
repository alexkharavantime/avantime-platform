import type { Metadata } from 'next';
import { PageShell } from '../../components/page-shell';
import { solutions } from '../../lib/content';

export const metadata: Metadata = { title: 'Решения — Avantime', description: '1С, AI, Agent+, интеграции, облачная инфраструктура и клиентские порталы.' };

export default function SolutionsPage() {
  return <PageShell>
    <section className="border-b border-slate-200 bg-[linear-gradient(135deg,#f8fbff,#eef6ff,#f0fdfa)]">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28"><p className="eyebrow">Решения Avantime</p><h1 className="mt-5 max-w-4xl text-5xl font-black tracking-[-0.045em] sm:text-7xl">Единая архитектура цифрового бизнеса</h1><p className="mt-7 max-w-3xl text-xl leading-9 text-slate-600">Соединяем учет, работу сотрудников, взаимодействие с клиентами и искусственный интеллект в управляемую систему.</p></div>
    </section>
    <section className="bg-slate-50 py-20"><div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-2 lg:grid-cols-3">{solutions.map((item) => <a key={item.slug} href={`/solutions/${item.slug}`} className="group flex min-h-96 flex-col rounded-3xl border border-slate-200 bg-white p-8 transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-2xl hover:shadow-blue-950/10"><span className="text-sm font-black tracking-[0.2em] text-blue-600">{item.number}</span><h2 className="mt-8 text-3xl font-black tracking-tight">{item.title}</h2><p className="mt-5 flex-1 leading-7 text-slate-600">{item.summary}</p><div className="mt-7 flex flex-wrap gap-2">{item.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{tag}</span>)}</div><span className="mt-8 font-black text-blue-600">Подробнее →</span></a>)}</div></section>
  </PageShell>;
}
