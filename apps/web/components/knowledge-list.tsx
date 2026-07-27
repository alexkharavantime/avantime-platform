const documents = [
  { name: 'ТЗ Avantime 3.0', type: 'PDF', status: 'Готов к индексации', updated: 'Сегодня' },
  { name: 'Регламент поддержки клиентов', type: 'DOCX', status: 'Обработан', updated: 'Вчера' },
  { name: 'Agent+ — описание решения', type: 'PDF', status: 'Обработан', updated: '2 дня назад' },
];

export function KnowledgeList() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-black text-slate-950">Последние документы</h2><p className="text-sm text-slate-500">Демонстрационные данные Sprint 1</p></div><button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">Загрузить</button></div>
      <div className="divide-y divide-slate-100">{documents.map((document) => (
        <div key={document.name} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="font-bold text-slate-900">{document.name}</p><p className="mt-1 text-xs text-slate-500">{document.type}</p></div><span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{document.status}</span><span className="text-sm text-slate-500">{document.updated}</span></div>
      ))}</div>
    </div>
  );
}
