import type { Metadata } from 'next';
import { AiConsultant } from '../../components/ai-consultant';
import { PageShell } from '../../components/page-shell';

export const metadata: Metadata = {
  title: 'AI-консультант — Avantime',
  description: 'Демонстрационный AI-консультант по автоматизации бизнеса, 1С и интеграциям.',
};

export default function AssistantPage() {
  return (
    <PageShell>
      <section className="bg-[linear-gradient(135deg,#eff6ff,#f0fdfa)] py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="eyebrow">Avantime AI</p>
            <h1 className="mt-5 text-5xl font-black tracking-[-0.045em] sm:text-7xl">
              Опишите задачу обычными словами
            </h1>
            <p className="mt-7 max-w-xl text-xl leading-9 text-slate-600">
              Консультант поможет сформулировать возможный первый этап. Сейчас ответы работают по
              демонстрационным правилам; позже подключим модель и базу знаний Avantime.
            </p>
            <div className="mt-9 rounded-3xl border border-blue-100 bg-white/80 p-6">
              <p className="font-black">Что появится в следующей AI-версии</p>
              <ul className="mt-4 space-y-3 text-slate-600">
                <li>• ответы с указанием источников;</li>
                <li>• поиск по базе знаний и услугам;</li>
                <li>• формирование черновика обращения;</li>
                <li>• передача диалога специалисту.</li>
              </ul>
            </div>
          </div>
          <AiConsultant />
        </div>
      </section>
    </PageShell>
  );
}
