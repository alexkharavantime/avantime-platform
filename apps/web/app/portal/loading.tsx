export default function PortalLoading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12" role="status" aria-live="polite">
      <div className="h-7 w-48 animate-pulse rounded-lg bg-slate-200" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-200" />
        ))}
      </div>
      <span className="sr-only">Загрузка кабинета…</span>
    </div>
  );
}
