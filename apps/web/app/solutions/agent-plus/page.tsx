import Link from 'next/link';
import { SiteHeader } from '../../../components/site-header';

const capabilities = [
  ['Маршруты и визиты', 'Планирование маршрутов, контроль посещений и фиксация результата на мобильном устройстве.'],
  ['Заказы и остатки', 'Заказы с актуальными остатками, ценами, скидками и условиями поставки из учетной системы.'],
  ['Дебиторская задолженность', 'Контроль задолженности, лимитов и сроков оплаты до подтверждения заказа.'],
  ['Фото и задачи', 'Фотоотчеты, контроль выкладки, задания и подтверждение выполнения на торговой точке.'],
  ['Обмен с 1С', 'Двусторонний обмен справочниками, ценами, остатками, заказами, оплатами и результатами визитов.'],
  ['Работа без связи', 'Ключевые операции доступны офлайн, данные синхронизируются после восстановления связи.'],
];

const steps = [
  ['01', 'Диагностика', 'Определяем роли, маршруты, документы, правила цен и состав обмена с 1С.'],
  ['02', 'Пилот', 'Запускаем рабочую версию на небольшой группе торговых представителей.'],
  ['03', 'Интеграция', 'Настраиваем обмен, права, контроль ошибок и мониторинг синхронизации.'],
  ['04', 'Масштабирование', 'Подключаем команду, обучаем пользователей и развиваем сценарии.'],
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function AgentPlusPage() {
  return (
    <main className="overflow-hidden bg-white text-slate-950">
      <SiteHeader />

      <section className="relative border-b border-slate-200 bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_30%,rgba(37,99,235,0.30),transparent_38%),radial-gradient(circle_at_25%_85%,rgba(34,211,238,0.16),transparent_32%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-14 px-6 py-20 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:py-28">
          <div>
            <div className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-200">
              Agent+ · мобильная торговля
            </div>
            <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Продажи в поле —
              <span className="block bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                под контролем в реальном времени
              </span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
              Agent+ объединяет торгового представителя, клиента и 1С: маршруты, заказы,
              остатки, цены, задолженность, задачи и результаты визитов.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/#contact" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-blue-600 px-7 font-black text-white transition hover:bg-blue-500">
                Обсудить внедрение <ArrowIcon />
              </Link>
              <Link href="#capabilities" className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/20 bg-white/5 px-7 font-black text-white transition hover:bg-white/10">
                Возможности Agent+
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur sm:p-7">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">Рабочий день</p>
                <p className="mt-2 text-2xl font-black">Торговый представитель</p>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">online</span>
            </div>
            <div className="mt-6 space-y-3">
              {[
                ['09:00', 'Маршрут загружен', '8 торговых точек'],
                ['10:20', 'Заказ создан', '24 позиции · €1 840'],
                ['12:10', 'Фотоотчет принят', 'Выкладка подтверждена'],
                ['14:45', 'Оплата зафиксирована', 'Долг уменьшен на €620'],
              ].map(([time, title, text]) => (
                <div key={time} className="grid grid-cols-[64px_1fr] gap-4 rounded-2xl bg-white/5 p-4">
                  <span className="font-black text-blue-300">{time}</span>
                  <div>
                    <p className="font-black">{title}</p>
                    <p className="mt-1 text-sm text-slate-400">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="capabilities" className="bg-slate-50 py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <p className="eyebrow">Возможности</p>
          <h2 className="section-title mt-4">Все необходимое для мобильной команды продаж</h2>
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(([title, text], index) => (
              <article key={title} className="rounded-3xl border border-slate-200 bg-white p-7">
                <span className="text-sm font-black tracking-[0.18em] text-blue-600">0{index + 1}</span>
                <h3 className="mt-7 text-2xl font-black tracking-tight">{title}</h3>
                <p className="mt-4 leading-7 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="eyebrow">Интеграция с 1С</p>
            <h2 className="section-title mt-4">Часть единого учетного контура</h2>
            <p className="mt-6 text-lg leading-8 text-slate-600">
              Agent+ получает из 1С справочники, цены, остатки и взаиморасчеты, а возвращает
              заказы, оплаты, результаты визитов, фото и задачи.
            </p>
          </div>
          <div className="rounded-3xl bg-slate-950 p-8 text-white">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div className="rounded-2xl bg-white/5 p-6">
                <p className="font-black text-blue-300">1С</p>
                <p className="mt-4 text-sm leading-7 text-slate-300">Номенклатура · цены · остатки · клиенты · задолженность</p>
              </div>
              <div className="text-center text-2xl">↔</div>
              <div className="rounded-2xl bg-white/5 p-6">
                <p className="font-black text-cyan-300">Agent+</p>
                <p className="mt-4 text-sm leading-7 text-slate-300">Заказы · оплаты · визиты · фото · задачи · координаты</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-950 py-24 text-white sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <p className="font-black uppercase tracking-[0.18em] text-cyan-300">Внедрение</p>
          <h2 className="mt-4 text-4xl font-black tracking-[-0.035em] sm:text-5xl">Запуск поэтапно, без остановки продаж</h2>
          <div className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-white/10 md:grid-cols-2 lg:grid-cols-4">
            {steps.map(([number, title, text]) => (
              <article key={number} className="bg-slate-950 p-7">
                <span className="text-sm font-black text-blue-300">{number}</span>
                <h3 className="mt-6 text-xl font-black">{title}</h3>
                <p className="mt-4 leading-7 text-slate-400">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-blue-600 py-16 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Покажем, как Agent+ впишется в ваши процессы</h2>
          <Link  href="/#contact"
          className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-white px-7 font-black text-blue-700">
            Запросить консультацию <ArrowIcon />
          </Link>
        </div>
      </section>
    </main>
  );
}
