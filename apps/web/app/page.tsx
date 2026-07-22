import { ContactForm } from '../components/contact-form';
import { SiteHeader } from '../components/site-header';

const solutions = [
  {
    number: '01',
    title: 'Внедрение и развитие 1С',
    text: 'Проектируем учет и управленческие процессы, внедряем решения 1С, развиваем существующие конфигурации и сопровождаем пользователей.',
    tags: ['Внедрение', 'Доработки', 'Сопровождение'],
  },
  {
    number: '02',
    title: 'AI для бизнес-процессов',
    text: 'Создаем ассистентов и AI-агентов для работы с документами, знаниями, обращениями клиентов и внутренними операциями.',
    tags: ['AI-ассистенты', 'RAG', 'Агенты'],
  },
  {
    number: '03',
    title: 'Agent+ и мобильная торговля',
    text: 'Организуем работу торговых представителей: маршруты, заказы, остатки, цены, контроль задач и обмен с учетной системой.',
    tags: ['Мобильные продажи', 'Маршруты', 'Обмен'],
  },
  {
    number: '04',
    title: 'Интеграции и ЭДО',
    text: 'Связываем 1С, сайты, Jira, маркетплейсы, API и системы электронного документооборота в единый цифровой контур.',
    tags: ['API', 'Jira', 'ЭДО'],
  },
  {
    number: '05',
    title: 'Облачная инфраструктура',
    text: 'Помогаем перейти к надежной инфраструктуре, организуем доступ, резервирование, мониторинг и безопасную работу сервисов.',
    tags: ['Cloud', 'Мониторинг', 'Безопасность'],
  },
  {
    number: '06',
    title: 'Кабинеты и корпоративные порталы',
    text: 'Создаем клиентские кабинеты, базы знаний и сервисные порталы с интеграцией в учетные и сервисные системы.',
    tags: ['Личный кабинет', 'База знаний', 'Service desk'],
  },
];

const industries = [
  ['Оптовая и розничная торговля', 'Управление ассортиментом, складами, заказами и распределенными точками.'],
  ['Дистрибуция и FMCG', 'Мобильные продажи, маршруты, дебиторская задолженность и контроль исполнения.'],
  ['Производство', 'Планирование, закупки, себестоимость, прослеживаемость и обмен данными.'],
  ['Профессиональные услуги', 'Проекты, обращения, документы, знания и прозрачная работа с клиентами.'],
];

const insights = [
  {
    type: 'Практика',
    title: 'Как подготовить компанию к внедрению AI без большого и рискованного проекта',
    text: 'Начинаем с одного процесса, измеримого результата и контролируемой базы знаний.',
  },
  {
    type: '1С',
    title: 'Когда доработка 1С полезнее замены всей системы',
    text: 'Разбираем признаки, при которых развитие текущей конфигурации дает быстрый эффект.',
  },
  {
    type: 'Интеграции',
    title: 'Клиентский кабинет, Jira и 1С: как разделить ответственность систем',
    text: 'Архитектурный подход без дублирования данных и лишней сложности.',
  },
];

const steps = [
  ['Диагностика', 'Фиксируем бизнес-задачу, ограничения, данные и ожидаемый эффект.'],
  ['Рабочий прототип', 'Быстро создаем первую версию решения на реальных сценариях.'],
  ['Проверка', 'Тестируем с пользователями, измеряем результат и корректируем решение.'],
  ['Развитие', 'Масштабируем только то, что подтвердило практическую ценность.'],
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main id="top" className="overflow-hidden bg-white text-slate-950">
      <SiteHeader />

      <section className="relative border-b border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#eef5ff_52%,#f2fffc_100%)]">
        <div className="hero-grid absolute inset-0 opacity-55" />
        <div className="absolute -right-24 top-16 h-96 w-96 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-blue-400/20 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl gap-14 px-6 py-20 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:py-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Практичная автоматизация с AI
            </div>
            <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Технологии, которые
              <span className="block bg-gradient-to-r from-blue-700 to-cyan-500 bg-clip-text text-transparent">
                работают на бизнес
              </span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              Avantime внедряет 1С, развивает цифровые процессы и создает AI-решения, которые
              помогают компаниям работать быстрее, прозрачнее и точнее.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="#contact"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-blue-600 px-7 font-bold text-white shadow-xl shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700"
              >
                Обсудить проект <ArrowIcon />
              </a>
              <a
                href="#solutions"
                className="inline-flex min-h-14 items-center justify-center rounded-full border border-slate-300 bg-white/70 px-7 font-bold text-slate-800 transition hover:border-blue-300 hover:bg-white"
              >
                Наши решения
              </a>
            </div>
            <div className="mt-10 grid max-w-2xl gap-4 text-sm font-semibold text-slate-700 sm:grid-cols-3">
              {['Фокус на результате', 'Поэтапное внедрение', 'Единая архитектура'].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                    <CheckIcon />
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-8 rounded-[3rem] bg-blue-500/10 blur-2xl" />
            <div className="relative rounded-[2rem] border border-white bg-slate-950 p-5 shadow-2xl shadow-blue-950/25 sm:p-7">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 font-black text-white">
                    AI
                  </span>
                  <div>
                    <p className="font-bold text-white">Avantime Assistant</p>
                    <p className="text-xs text-slate-400">Анализ бизнес-задачи</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
                  online
                </span>
              </div>

              <div className="space-y-4 py-6">
                <div className="max-w-[86%] rounded-2xl rounded-tl-sm bg-white/10 p-4 text-sm leading-6 text-slate-200">
                  Что сейчас создает больше всего ручной работы?
                </div>
                <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-blue-600 p-4 text-sm leading-6 text-white">
                  Обращения клиентов приходят по почте, затем вручную переносятся в Jira и 1С.
                </div>
                <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-white/10 p-4 text-sm leading-6 text-slate-200">
                  Предлагаю начать с единой формы обращения и автоматической маршрутизации. Затем
                  подключить базу знаний и AI-классификацию запросов.
                </div>
              </div>

              <div className="grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3">
                {[
                  ['−40%', 'ручных операций'],
                  ['1 окно', 'для клиента'],
                  ['24/7', 'доступ к знаниям'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-xl bg-white/5 p-3">
                    <p className="text-xl font-black text-white">{value}</p>
                    <p className="mt-1 text-xs text-slate-400">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['1С', 'основа надежного учета'],
            ['AI', 'ускорение ежедневной работы'],
            ['Agent+', 'мобильные продажи'],
            ['Интеграции', 'единый цифровой контур'],
          ].map(([title, text]) => (
            <div key={title} className="flex items-center gap-4">
              <span className="h-10 w-1 rounded-full bg-gradient-to-b from-blue-600 to-cyan-400" />
              <div>
                <p className="font-black text-slate-950">{title}</p>
                <p className="text-sm text-slate-500">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="solutions" className="bg-slate-50 py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="eyebrow">Решения Avantime</p>
              <h2 className="section-title mt-4">Автоматизация без разрыва между системами</h2>
            </div>
            <p className="max-w-2xl text-lg leading-8 text-slate-600 lg:justify-self-end">
              Мы рассматриваем учет, продажи, сервис, документы и данные как единый процесс. Это
              позволяет внедрять изменения постепенно, не создавая новый технологический хаос.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {solutions.map((solution) => (
              <a
                href={`/solutions/${['1c', 'ai', 'agent-plus', 'integrations', 'cloud', 'portals'][Number(solution.number) - 1]}`}
                key={solution.number}
                className="group flex min-h-[330px] flex-col rounded-3xl border border-slate-200 bg-white p-7 transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-2xl hover:shadow-blue-950/10"
              >
                <div className="flex items-start justify-between">
                  <span className="text-sm font-black tracking-[0.2em] text-blue-600">{solution.number}</span>
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-blue-600 group-hover:text-white">
                    <ArrowIcon />
                  </span>
                </div>
                <h3 className="mt-8 text-2xl font-black tracking-tight">{solution.title}</h3>
                <p className="mt-4 flex-1 leading-7 text-slate-600">{solution.text}</p>
                <div className="mt-7 flex flex-wrap gap-2">
                  {solution.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                      {tag}
                    </span>
                  ))}
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section id="industries" className="py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-3xl">
            <p className="eyebrow">Отраслевой опыт</p>
            <h2 className="section-title mt-4">Понимаем процессы, а не только технологии</h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Решение должно учитывать реальные роли сотрудников, движение документов, особенности
              учета и привычный ритм компании.
            </p>
          </div>

          <div className="mt-14 grid overflow-hidden rounded-3xl border border-slate-200 lg:grid-cols-2">
            {industries.map(([title, text], index) => (
              <article
                key={title}
                className={`group min-h-64 p-8 transition hover:bg-slate-950 hover:text-white sm:p-10 ${
                  index % 2 === 0 ? 'lg:border-r lg:border-slate-200' : ''
                } ${index < 2 ? 'border-b border-slate-200' : ''}`}
              >
                <span className="text-sm font-black text-blue-600 group-hover:text-cyan-300">0{index + 1}</span>
                <h3 className="mt-8 text-2xl font-black">{title}</h3>
                <p className="mt-4 max-w-xl leading-7 text-slate-600 group-hover:text-slate-300">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="approach" className="bg-slate-950 py-24 text-white sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="font-black uppercase tracking-[0.18em] text-cyan-300">Как мы работаем</p>
              <h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.035em] sm:text-5xl">
                От задачи к работающему результату
              </h2>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-400">
                Не начинаем с многомесячного проекта. Выбираем значимый сценарий, создаем рабочую
                версию и развиваем ее на основе фактов.
              </p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-3xl bg-white/10 sm:grid-cols-2">
              {steps.map(([title, text], index) => (
                <article key={title} className="bg-slate-950 p-7 sm:p-8">
                  <div className="flex items-center gap-4">
                    <span className="grid h-11 w-11 place-items-center rounded-full border border-blue-400/40 bg-blue-500/10 font-black text-blue-300">
                      {index + 1}
                    </span>
                    <h3 className="text-xl font-black">{title}</h3>
                  </div>
                  <p className="mt-5 leading-7 text-slate-400">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-blue-600 py-16 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-100">Первый шаг</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Найдем одну задачу, с которой стоит начать
            </h2>
          </div>
          <a
            href="#contact"
            className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-white px-7 font-black text-blue-700 transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            Назначить консультацию <ArrowIcon />
          </a>
        </div>
      </section>

      <section id="insights" className="bg-slate-50 py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Материалы и знания</p>
              <h2 className="section-title mt-4">Практика цифровой трансформации</h2>
            </div>
            <span className="text-sm font-bold text-slate-500">Раздел подготовлен для подключения CMS</span>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {insights.map((item, index) => (
              <a href={`/knowledge/${['ai-first-step', 'develop-or-replace-1c', 'portal-jira-1c'][index]}`} key={item.title} className="rounded-3xl border border-slate-200 bg-white p-7">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">{item.type}</p>
                <h3 className="mt-6 text-2xl font-black leading-tight tracking-tight">{item.title}</h3>
                <p className="mt-4 leading-7 text-slate-600">{item.text}</p>
                <span className="mt-7 inline-flex items-center gap-2 font-bold text-blue-600">
                  Читать материал <ArrowIcon />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="relative overflow-hidden bg-[linear-gradient(135deg,#eff6ff,#ecfeff)] py-24 sm:py-28">
        <div className="absolute -right-32 top-0 h-96 w-96 rounded-full bg-cyan-300/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="eyebrow">Связаться с Avantime</p>
            <h2 className="section-title mt-4">Расскажите, что нужно улучшить</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              Подойдет даже краткое описание. На первой встрече определим задачу, возможный формат
              решения и разумный следующий шаг.
            </p>
            <div className="mt-9 space-y-4">
              {['Обсудим текущий процесс', 'Определим приоритетный сценарий', 'Предложим формат первого этапа'].map(
                (item) => (
                  <div key={item} className="flex items-center gap-3 font-bold text-slate-800">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-blue-600 shadow-sm">
                      <CheckIcon />
                    </span>
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>
          <ContactForm />
        </div>
      </section>

      <footer className="bg-slate-950 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1fr_auto_auto]">
          <div className="max-w-md">
            <p className="text-2xl font-black text-white">Avantime<span className="text-blue-500">.</span></p>
            <p className="mt-4 leading-7 text-slate-400">
              1С, искусственный интеллект и интеграции для практической автоматизации бизнеса.
            </p>
          </div>
          <div>
            <p className="font-black text-white">Решения</p>
            <div className="mt-4 space-y-3 text-sm text-slate-400">
              <p>Внедрение 1С</p>
              <p>AI и автоматизация</p>
              <p>Agent+</p>
              <p>Интеграции и ЭДО</p>
            </div>
          </div>
          <div>
            <p className="font-black text-white">Платформа</p>
            <div className="mt-4 space-y-3 text-sm text-slate-400">
              <p>Клиентский кабинет</p>
              <p>База знаний</p>
              <p>AI-консультант</p>
              <p>Поддержка</p>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-xs text-slate-500 sm:flex-row sm:justify-between">
            <span>© 2026 Avantime. Первая демонстрационная версия.</span>
            <span>Сайт · Клиентский портал · AI-платформа</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
