'use client';

export default function PortalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-black uppercase tracking-widest text-red-700">Ошибка</p>
      <h1 className="mt-3 text-3xl font-black">Раздел временно недоступен</h1>
      <p className="mt-3 text-slate-600">
        Повторите попытку. Если ошибка сохраняется, сообщите поддержке время события.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"
      >
        Повторить
      </button>
    </div>
  );
}
