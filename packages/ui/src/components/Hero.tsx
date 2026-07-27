type HeroProps = {
  title: string;
  subtitle: string;
};

export default function Hero({ title, subtitle }: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-28 lg:flex lg:items-center lg:justify-between">

        <div className="max-w-2xl">

          <span className="inline-flex rounded-full bg-blue-600/20 px-4 py-1 text-sm text-blue-300">
            AI • 1С • Agent+ • Integration
          </span>

          <h1 className="mt-6 text-5xl font-bold leading-tight">
            {title}
          </h1>

          <p className="mt-6 text-xl text-slate-300">
            {subtitle}
          </p>

          <div className="mt-10 flex gap-4">
            <button className="rounded-xl bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500">
              Обсудить проект
            </button>

            <button className="rounded-xl border border-slate-600 px-6 py-3 hover:bg-slate-800">
              Демонстрация
            </button>
          </div>

        </div>

        <div className="mt-16 lg:mt-0">

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">

<pre className="text-blue-300 text-lg">
{`1С

 ↓

AI

 ↓

Jira
Microsoft365
Power BI
Agent+
`}
</pre>

          </div>

        </div>

      </div>
    </section>
  );
}