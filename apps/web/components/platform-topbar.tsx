export function PlatformTopbar() {
  return (
    <header className="flex min-h-20 items-center justify-between border-b border-slate-200 bg-white px-6 lg:px-8">
      <div><p className="text-sm font-semibold text-slate-500">Рабочее пространство</p><h1 className="text-xl font-black text-slate-950">Avantime AI Platform</h1></div>
      <div className="flex items-center gap-3"><button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Помощь</button><div className="grid h-10 w-10 place-items-center rounded-full bg-blue-600 text-sm font-black text-white">AK</div></div>
    </header>
  );
}
