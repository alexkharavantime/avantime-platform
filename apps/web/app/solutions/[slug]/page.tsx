import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '../../../components/page-shell';
import { solutions } from '../../../lib/content';

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return solutions.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; const item = solutions.find((solution) => solution.slug === slug); return item ? { title: `${item.title} — Avantime`, description: item.summary } : {}; }

export default async function SolutionPage({ params }: Props) {
  const { slug } = await params; const item = solutions.find((solution) => solution.slug === slug); if (!item) notFound();
  return <PageShell>
    <section className="border-b border-slate-200 bg-slate-950 text-white"><div className="mx-auto max-w-7xl px-6 py-20 sm:py-28"><Link href="/solutions" className="text-sm font-bold text-cyan-300">← Все решения</Link><p className="mt-10 text-sm font-black tracking-[0.2em] text-blue-300">{item.number} · {item.shortTitle}</p><h1 className="mt-5 max-w-5xl text-5xl font-black tracking-[-0.045em] sm:text-7xl">{item.title}</h1><p className="mt-7 max-w-3xl text-xl leading-9 text-slate-300">{item.description}</p></div></section>
    <section className="py-20"><div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.75fr_1.25fr]"><div><p className="eyebrow">Результат</p><h2 className="section-title mt-4">Что получает бизнес</h2><div className="mt-8 space-y-3">{item.outcomes.map((outcome) => <div key={outcome} className="rounded-2xl bg-blue-50 p-5 font-black text-blue-950">✓ {outcome}</div>)}</div></div><div className="grid gap-5 sm:grid-cols-2">{item.capabilities.map((capability, index) => <article key={capability.title} className="rounded-3xl border border-slate-200 p-7"><span className="text-sm font-black text-blue-600">0{index + 1}</span><h3 className="mt-5 text-2xl font-black">{capability.title}</h3><p className="mt-4 leading-7 text-slate-600">{capability.text}</p></article>)}</div></div></section>
    <section className="bg-blue-600 py-16 text-white"><div className="mx-auto flex max-w-7xl flex-col gap-7 px-6 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-black uppercase tracking-[0.18em] text-blue-100">Следующий шаг</p><h2 className="mt-3 text-3xl font-black">Обсудим задачу и границы первого этапа</h2></div><Link href="/contacts" className="inline-flex min-h-14 items-center justify-center rounded-full bg-white px-7 font-black text-blue-700">Связаться с Avantime</Link></div></section>
  </PageShell>;
}
