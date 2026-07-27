import Link from 'next/link';
import { KnowledgeList } from '../../components/knowledge-list';
import { QuickActions } from '../../components/quick-actions';

export default function DashboardPage() {
  return (
    <main className="p-6 lg:p-8">
      <section className="rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#172554_55%,#0e7490_100%)] p-7 text-white shadow-xl lg:p-10">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-cyan-300">Avantime Intelligence · MVP</p><h2 className="mt-4 max-w-3xl text-3xl font-black tracking-tight lg:text-5xl">Рабочее пространство Avantime</h2><p className="mt-4 max-w-2xl leading-7 text-slate-300">Knowledge Center доступен в первой версии. AI-консультант и остальные разделы явно отмечены как находящиеся в разработке.</p>
        <Link href="/dashboard/knowledge" className="mt-7 inline-flex min-h-14 items-center rounded-2xl bg-blue-500 px-6 font-black text-white hover:bg-blue-400">Открыть Knowledge Center</Link>
      </section>
      <section className="mt-8"><div className="mb-4"><h2 className="text-2xl font-black text-slate-950">Быстрые действия</h2><p className="mt-1 text-slate-500">Основные разделы рабочего пространства</p></div><QuickActions /></section>
      <section className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_0.6fr]"><KnowledgeList /><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-950">Состояние платформы</h2><div className="mt-5 space-y-4">{[['AI-консультант','В разработке'],['Knowledge Center','MVP · ADMIN'],['Векторная индексация','TASK-002']].map(([label,value])=><div key={label} className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{label}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-right text-xs font-bold text-slate-700">{value}</span></div>)}</div></div></section>
    </main>
  );
}
