import { KnowledgeList } from '../../components/knowledge-list';
import { QuickActions } from '../../components/quick-actions';

export default function DashboardPage() {
  return (
    <main className="p-6 lg:p-8">
      <section className="rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#172554_55%,#0e7490_100%)] p-7 text-white shadow-xl lg:p-10">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-cyan-300">Avantime Intelligence</p><h2 className="mt-4 max-w-3xl text-3xl font-black tracking-tight lg:text-5xl">Чем Avantime AI может помочь сегодня?</h2><p className="mt-4 max-w-2xl leading-7 text-slate-300">Найдите информацию в базе знаний, проанализируйте документ или создайте обращение в поддержку.</p>
        <form action="/dashboard/ai" className="mt-7 flex max-w-3xl gap-3"><input name="question" placeholder="Например: как организовать обмен между 1С и Jira?" className="min-h-14 flex-1 rounded-2xl border border-white/10 bg-white px-5 text-slate-950 outline-none ring-blue-300 focus:ring-4"/><button className="rounded-2xl bg-blue-500 px-6 font-black text-white hover:bg-blue-400">Спросить AI</button></form>
      </section>
      <section className="mt-8"><div className="mb-4"><h2 className="text-2xl font-black text-slate-950">Быстрые действия</h2><p className="mt-1 text-slate-500">Основные разделы рабочего пространства</p></div><QuickActions /></section>
      <section className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_0.6fr]"><KnowledgeList /><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-950">Состояние платформы</h2><div className="mt-5 space-y-4">{[['AI-сервис','Работает'],['Knowledge Center','MVP'],['Индексация','Следующий этап']].map(([label,value])=><div key={label} className="flex items-center justify-between"><span className="text-sm text-slate-600">{label}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{value}</span></div>)}</div></div></section>
    </main>
  );
}
