import type { Metadata } from 'next';
import { ContactForm } from '../../components/contact-form';
import { PageShell } from '../../components/page-shell';
import { getLocale } from '../../lib/i18n-server';

const pageCopy = {
  lv: { eyebrow: 'Kontakti', title: 'Sāksim ar reālu uzdevumu', description: 'Aprakstiet pašreizējo procesu, problēmu vai ideju. Piedāvāsim saprātīgu pirmo soli.', useful: 'Noderīgi norādīt', items: ['Kāda sistēma tiek izmantota tagad', 'Kur rodas manuāls darbs vai kļūdas', 'Kas piedalās procesā', 'Kādu rezultātu uzskatāt par veiksmīgu'] },
  ru: { eyebrow: 'Контакты', title: 'Начнем с реальной задачи', description: 'Опишите текущий процесс, проблему или идею. Мы предложим разумный формат первого шага.', useful: 'Что полезно указать', items: ['Какая система используется сейчас', 'Где возникает ручная работа или ошибки', 'Кто участвует в процессе', 'Какой результат вы считаете успешным'] },
  en: { eyebrow: 'Contacts', title: 'Start with a real task', description: 'Describe your current process, problem or idea. We will suggest a practical first step.', useful: 'Useful details', items: ['Which system you use today', 'Where manual work or errors occur', 'Who is involved in the process', 'What result would be successful'] },
} as const;
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const metadata = {
    lv: { title: 'Kontakti — Avantime', description: 'Sazinieties ar Avantime un pārrunājiet automatizācijas uzdevumu.' },
    ru: { title: 'Контакты — Avantime', description: 'Связаться с Avantime и обсудить задачу автоматизации.' },
    en: { title: 'Contacts — Avantime', description: 'Contact Avantime to discuss your automation task.' },
  } as const;
  return metadata[locale];
}
export default async function ContactsPage() {
  const copy = pageCopy[await getLocale()];
  return (
    <PageShell>
      <section className="bg-[linear-gradient(135deg,#eff6ff,#ecfeff)] py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1 className="mt-5 text-5xl font-black tracking-[-0.045em] sm:text-7xl">{copy.title}</h1>
            <p className="mt-7 max-w-xl text-xl leading-9 text-slate-600">{copy.description}</p>
            <div className="mt-10 rounded-3xl border border-blue-100 bg-white/80 p-7">
              <p className="font-black">{copy.useful}</p>
              <ul className="mt-4 space-y-3 text-slate-600">
                {copy.items.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          </div>
          <ContactForm />
        </div>
      </section>
    </PageShell>
  );
}
