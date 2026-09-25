import type { Metadata } from 'next';
import { AiConsultant } from '../../components/ai-consultant';
import { PageShell } from '../../components/page-shell';
import { getLocale } from '../../lib/i18n-server';

const pageCopy = {
  lv: { eyebrow: 'Avantime AI', title: 'Aprakstiet uzdevumu saviem vārdiem', description: 'Konsultants palīdzēs formulēt iespējamo pirmo soli. Šobrīd atbildes darbojas demonstrācijas režīmā.', next: 'Kas būs nākamajā AI versijā', items: ['Atbildes ar avotu norādēm', 'Meklēšana zināšanu bāzē un pakalpojumos', 'Pieprasījuma uzmetuma izveide', 'Dialoga nodošana speciālistam'] },
  ru: { eyebrow: 'Avantime AI', title: 'Опишите задачу обычными словами', description: 'Консультант поможет сформулировать возможный первый этап. Сейчас ответы работают по демонстрационным правилам.', next: 'Что появится в следующей AI-версии', items: ['ответы с указанием источников', 'поиск по базе знаний и услугам', 'формирование черновика обращения', 'передача диалога специалисту'] },
  en: { eyebrow: 'Avantime AI', title: 'Describe your task in plain language', description: 'The consultant will help formulate a possible first step. Answers currently use demonstration rules.', next: 'What the next AI version will add', items: ['answers with sources', 'search across knowledge and services', 'request draft generation', 'handoff to a specialist'] },
} as const;

export const metadata: Metadata = {
  title: 'AI-консультант — Avantime',
  description: 'Демонстрационный AI-консультант по автоматизации бизнеса, 1С и интеграциям.',
};

export default async function AssistantPage() {
  const copy = pageCopy[await getLocale()];
  return (
    <PageShell>
      <section className="bg-[linear-gradient(135deg,#eff6ff,#f0fdfa)] py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1 className="mt-5 text-5xl font-black tracking-[-0.045em] sm:text-7xl">{copy.title}</h1>
            <p className="mt-7 max-w-xl text-xl leading-9 text-slate-600">{copy.description}</p>
            <div className="mt-9 rounded-3xl border border-blue-100 bg-white/80 p-6">
              <p className="font-black">{copy.next}</p>
              <ul className="mt-4 space-y-3 text-slate-600">
                {copy.items.map((item) => <li key={item}>• {item};</li>)}
              </ul>
            </div>
          </div>
          <AiConsultant />
        </div>
      </section>
    </PageShell>
  );
}
