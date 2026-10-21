'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { localePath, type Locale } from '../lib/i18n';

type AnswerSource = {
  number?: number;
  sourceType?: 'DOCUMENT' | 'ARTICLE';
  sourceId?: string;
  sourceTitle?: string;
  documentId?: string;
  documentName?: string;
  documentTitle?: string;
  articleId?: string;
  articleSlug?: string;
  chunkId: string;
  score?: number;
  retrievalScore?: number;
  pageStart?: number | null;
  pageEnd?: number | null;
  excerpt?: string;
  link?: string;
};

type HistoryItem = {
  id: string;
  question: string;
  answer: string;
  sources: AnswerSource[];
  createdAt: string;
};

type AiBudgetBlockReason =
  | 'not_configured'
  | 'daily_limit_reached'
  | 'monthly_limit_reached'
  | 'provider_limit_reached'
  | 'insufficient_reservation'
  | 'session_limit_reached'
  | 'unknown';

const copy = {
  lv: { title: 'Uzdot jautājumu zināšanu bāzei', description: 'AI atradīs atbilstošus dokumentu fragmentus un sagatavos atbildi ar avotu saitēm.', label: 'Jautājums AI konsultantam', placeholder: 'Piemēram: kādas funkcijas jāveic AI konsultantam?', loading: 'AI gatavo atbildi…', ask: 'Saņemt AI atbildi', clear: 'Notīrīt', answer: 'AI atbilde', sources: 'Avoti', source: 'Avots', page: 'Lapa', history: 'Jautājumu vēsture', latest: 'Jaunākās AI konsultanta atbildes', clearHistory: 'Notīrīt vēsturi', historyLoading: 'Ielādē vēsturi…', empty: 'Vēsture pagaidām ir tukša', firstQuestion: 'Uzdodiet pirmo jautājumu zināšanu bāzei.', delete: 'Dzēst', questionTooShort: 'Ievadiet jautājumu, kas ir vismaz 3 rakstzīmes garš.', askError: 'Neizdevās saņemt AI atbildi.', noAnswer: 'AI neatgrieza atbildes tekstu.', providerTest: 'Aktīvs testa AI pakalpojumu sniedzējs; rezultāts nav ģenerēts ar reālu modeli.', budgetExceeded: 'AI budžets neļauj izpildīt pieprasījumu. Sazinieties ar administratoru.', budgetNotConfigured: 'AI budžets nav konfigurēts. Sazinieties ar administratoru.', budgetDailyLimitReached: 'Sasniegts AI dienas budžeta limits.', budgetMonthlyLimitReached: 'Sasniegts AI mēneša budžeta limits.', budgetProviderLimitReached: 'Sasniegts AI pakalpojumu sniedzēja budžeta limits.', budgetReservationInsufficient: 'Ar atlikušo AI budžetu nepietiek, lai rezervētu šo pieprasījumu.', budgetSessionLimitReached: 'Sasniegts AI sesijas limits.', budgetCheckUnavailable: 'AI budžeta pārbaude īslaicīgi nav pieejama. Mēģiniet vēlāk.', rateLimited: 'AI pieprasījumi īslaicīgi ierobežoti (AI_RATE_LIMITED). Mēģiniet vēlāk.', serviceUnavailable: 'Zināšanu meklēšana vai atbilžu ģenerēšana īslaicīgi nav pieejama. Mēģiniet vēlāk.', loadError: 'Neizdevās ielādēt jautājumu vēsturi.', saveError: 'Neizdevās saglabāt jautājumu vēsturē.', deleteQuestion: 'Dzēst jautājumu no vēstures', deleteError: 'Neizdevās dzēst vēstures ierakstu.', clearConfirm: 'Notīrīt visu jautājumu vēsturi?', clearError: 'Neizdevās notīrīt vēsturi.', sessionExpired: 'Sesija ir beigusies. Piesakieties vēlreiz un uzdodiet jautājumu atkārtoti.', outputLimit: 'Atbilde neiekļāvās atļautajā apjomā. Precizējiet vai sašauriniet jautājumu.' },
  ru: { title: 'Задать вопрос базе знаний', description: 'AI найдёт подходящие фрагменты документов и подготовит ответ со ссылками на источники.', label: 'Вопрос AI-консультанту', placeholder: 'Например: какие функции должен выполнять AI-консультант?', loading: 'AI готовит ответ…', ask: 'Получить ответ AI', clear: 'Очистить', answer: 'Ответ AI', sources: 'Источники', source: 'Источник', page: 'Страница', history: 'История вопросов', latest: 'Последние ответы AI-консультанта', clearHistory: 'Очистить историю', historyLoading: 'Загрузка истории…', empty: 'История пока пуста', firstQuestion: 'Задайте первый вопрос базе знаний.', delete: 'Удалить', questionTooShort: 'Введите вопрос не короче трёх символов.', askError: 'Не удалось получить ответ AI.', noAnswer: 'AI не вернул текст ответа.', providerTest: 'Активен тестовый AI-провайдер; результат не сгенерирован реальной моделью.', budgetExceeded: 'Бюджет AI не позволяет выполнить запрос. Обратитесь к администратору.', budgetNotConfigured: 'Бюджет AI не настроен. Обратитесь к администратору.', budgetDailyLimitReached: 'Достигнут дневной лимит бюджета AI.', budgetMonthlyLimitReached: 'Достигнут месячный лимит бюджета AI.', budgetProviderLimitReached: 'Достигнут лимит расходов AI-провайдера.', budgetReservationInsufficient: 'Остатка бюджета AI недостаточно для резервирования запроса.', budgetSessionLimitReached: 'Достигнут лимит AI-операций для сеанса.', budgetCheckUnavailable: 'Проверка бюджета AI временно недоступна. Попробуйте позже.', rateLimited: 'Лимит AI-запросов исчерпан (AI_RATE_LIMITED). Повторите позже.', serviceUnavailable: 'Поиск в базе знаний или генерация временно недоступны. Попробуйте позже.', loadError: 'Не удалось загрузить историю вопросов.', saveError: 'Не удалось сохранить вопрос в истории.', deleteQuestion: 'Удалить вопрос из истории', deleteError: 'Не удалось удалить запись истории.', clearConfirm: 'Очистить всю историю вопросов?', clearError: 'Не удалось очистить историю.', sessionExpired: 'Сессия истекла. Войдите снова и повторите вопрос.', outputLimit: 'Ответ не уместился в допустимый объём. Уточните или сузьте вопрос.' },
  en: { title: 'Ask the knowledge base', description: 'AI will find relevant document passages and prepare an answer with source links.', label: 'Question for the AI consultant', placeholder: 'For example: what should an AI consultant be able to do?', loading: 'AI is preparing an answer…', ask: 'Get an AI answer', clear: 'Clear', answer: 'AI answer', sources: 'Sources', source: 'Source', page: 'Page', history: 'Question history', latest: 'Recent AI consultant answers', clearHistory: 'Clear history', historyLoading: 'Loading history…', empty: 'The history is empty', firstQuestion: 'Ask your first question to the knowledge base.', delete: 'Delete', questionTooShort: 'Enter a question of at least three characters.', askError: 'Could not get an AI answer.', noAnswer: 'AI did not return answer text.', providerTest: 'A test AI provider is active; this result was not generated by a real model.', budgetExceeded: 'The AI budget does not allow this request. Contact an administrator.', budgetNotConfigured: 'The AI budget is not configured. Contact an administrator.', budgetDailyLimitReached: 'The daily AI budget limit has been reached.', budgetMonthlyLimitReached: 'The monthly AI budget limit has been reached.', budgetProviderLimitReached: 'The AI provider spending limit has been reached.', budgetReservationInsufficient: 'The remaining AI budget is insufficient to reserve this request.', budgetSessionLimitReached: 'The AI session operation limit has been reached.', budgetCheckUnavailable: 'AI budget verification is temporarily unavailable. Try again later.', rateLimited: 'AI requests are temporarily limited (AI_RATE_LIMITED). Try again later.', serviceUnavailable: 'Knowledge search or answer generation is temporarily unavailable. Try again later.', loadError: 'Could not load question history.', saveError: 'Could not save the question to history.', deleteQuestion: 'Delete question from history', deleteError: 'Could not delete the history item.', clearConfirm: 'Clear all question history?', clearError: 'Could not clear history.', sessionExpired: 'Your session has expired. Sign in again and repeat the question.', outputLimit: 'The answer did not fit within the allowed length. Refine or narrow the question.' },
} satisfies Record<Locale, Record<string, string>>;

const providerUnavailableCopy: Record<Locale, string> = {
  lv: 'AI atbildes nav pieejamas, jo nav konfigurēts AI pakalpojumu sniedzējs. Varat meklēt dokumentos pēc vārdiem.',
  ru: 'Ответы AI недоступны: не настроен AI-провайдер. Используйте отдельный поиск по документам.',
  en: 'AI answers are unavailable because no AI provider is configured. Use document search instead.',
};

function formatDate(value: string, locale: Locale) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function KnowledgeAsk({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<AnswerSource[]>([]);
  const [testProviderActive, setTestProviderActive] = useState(false);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadHistory() {
      try {
        setHistoryLoading(true);

        const response = await fetch('/api/documents/history', {
          cache: 'no-store',
        });

        const responseText = await response.text();

        let result: {
          history?: HistoryItem[];
          error?: string;
        };

        try {
          result = JSON.parse(responseText);
        } catch {
          throw new Error(`История вернула некорректный ответ. Код ${response.status}`);
        }

        if (!response.ok) {
          throw new Error(text.loadError);
        }

        setHistory(Array.isArray(result.history) ? result.history : []);
      } catch (historyError) {
        console.error('Knowledge history load error:', historyError);
      } finally {
        setHistoryLoading(false);
      }
    }

    void loadHistory();
  }, [text.loadError]);

  async function saveToHistory(
    savedQuestion: string,
    savedAnswer: string,
    savedSources: AnswerSource[],
  ) {
    const response = await fetch('/api/documents/history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: savedQuestion,
        answer: savedAnswer,
        sources: savedSources,
      }),
    });

    const responseText = await response.text();

    let result: {
      item?: HistoryItem;
      error?: string;
    };

    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(`История вернула некорректный ответ. Код ${response.status}`);
    }

    if (!response.ok || !result.item) {
      throw new Error(text.saveError);
    }

    setHistory((current) => [result.item as HistoryItem, ...current]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedQuestion = question.trim();

    if (normalizedQuestion.length < 3) {
      setError(text.questionTooShort);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setAnswer('');
      setSources([]);
      setTestProviderActive(false);

      const askResponse = await fetch('/api/documents/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: normalizedQuestion,
        }),
      });

      if (askResponse.status === 401) {
        throw new Error(text.sessionExpired);
      }

      const askText = await askResponse.text();

      let askResult: {
        answer?: string;
        citations?: AnswerSource[];
        status?: 'answered' | 'no_answer';
        providerMode?: { embedding?: string; answer?: string };
        error?: string;
        code?: string;
        budgetReason?: AiBudgetBlockReason;
        reason?: string;
      };

      try {
        askResult = JSON.parse(askText);
      } catch {
        throw new Error(`AI вернул некорректный ответ. Код ${askResponse.status}`);
      }

      if (!askResponse.ok) {
        if (askResult.code === 'AI_CONFIGURATION_INVALID') {
          throw new Error(providerUnavailableCopy[locale]);
        }
        if (askResult.code === 'AI_BUDGET_EXCEEDED') {
          const messages: Record<AiBudgetBlockReason, string> = {
            not_configured: text.budgetNotConfigured,
            daily_limit_reached: text.budgetDailyLimitReached,
            monthly_limit_reached: text.budgetMonthlyLimitReached,
            provider_limit_reached: text.budgetProviderLimitReached,
            insufficient_reservation: text.budgetReservationInsufficient,
            session_limit_reached: text.budgetSessionLimitReached,
            unknown: text.budgetExceeded,
          };
          throw new Error(messages[askResult.budgetReason ?? 'unknown']);
        }
        if (askResult.code === 'AI_BUDGET_UNAVAILABLE') {
          throw new Error(text.budgetCheckUnavailable);
        }
        if (askResult.reason === 'output_limit') {
          throw new Error(text.outputLimit);
        }
        if (askResult.code === 'AI_RATE_LIMITED') {
          throw new Error(text.rateLimited);
        }
        if (askResponse.status >= 500 || askResult.code === 'RAG_UNAVAILABLE') {
          throw new Error(text.serviceUnavailable);
        }
        throw new Error(text.askError);
      }

      const newAnswer = askResult.answer?.trim() ?? '';

      const newSources = Array.isArray(askResult.citations) ? askResult.citations : [];

      if (!newAnswer) {
        throw new Error(text.noAnswer);
      }

      setAnswer(newAnswer);
      setSources(newSources);
      setTestProviderActive(
        askResult.providerMode?.embedding === 'fake' || askResult.providerMode?.answer === 'fake',
      );

      try {
        await saveToHistory(normalizedQuestion, newAnswer, newSources);
      } catch (historyError) {
        console.error('Knowledge history save error:', historyError);
      }
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? text.serviceUnavailable
          : requestError instanceof Error
            ? requestError.message
            : text.askError,
      );
    } finally {
      setLoading(false);
    }
  }

  function openHistoryItem(item: HistoryItem) {
    setQuestion(item.question);
    setAnswer(item.answer);
    setSources(item.sources);
    setTestProviderActive(false);
    setError('');

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  async function deleteHistoryItem(item: HistoryItem) {
    const confirmed = window.confirm(`${text.deleteQuestion} «${item.question}»?`);

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/documents/history?id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(text.deleteError);
      }

      setHistory((current) => current.filter((historyItem) => historyItem.id !== item.id));
    } catch (deleteError) {
      window.alert(
        deleteError instanceof Error ? deleteError.message : text.deleteError,
      );
    }
  }

  async function clearHistory() {
    const confirmed = window.confirm(text.clearConfirm);

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch('/api/documents/history', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(text.clearError);
      }

      setHistory([]);
    } catch (clearError) {
      window.alert(
        clearError instanceof Error ? clearError.message : text.clearError,
      );
    }
  }

  function clearAnswer() {
    setQuestion('');
    setAnswer('');
    setSources([]);
    setTestProviderActive(false);
    setError('');
  }

  return (
    <>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
            AI Consultant
          </p>

          <h3 className="mt-2 text-xl font-black text-slate-950">{text.title}</h3>

          <p className="mt-1 text-sm text-slate-500">
            {text.description}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5">
          <label htmlFor="knowledge-question" className="sr-only">
            {text.label}
          </label>
          <textarea
            id="knowledge-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            placeholder={text.placeholder}
            className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3 outline-none ring-blue-200 focus:ring-4"
          />

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? text.loading : text.ask}
            </button>

            {answer || error ? (
              <button
                type="button"
                onClick={clearAnswer}
                disabled={loading}
                className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 hover:bg-slate-50"
              >
                {text.clear}
              </button>
            ) : null}
          </div>
        </form>

        {error ? (
          <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4">
            <p className="font-semibold text-red-700">{error}</p>
          </div>
        ) : null}

        {answer ? (
          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
            <h4 className="font-black text-slate-950">{text.answer}</h4>

            {testProviderActive ? (
              <p role="status" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                {text.providerTest}
              </p>
            ) : null}

            <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {answer}
            </div>

            {sources.length > 0 ? (
              <div className="mt-6 border-t border-blue-100 pt-4">
                <p className="text-sm font-black text-slate-900">{text.sources}</p>

                <div className="mt-3 space-y-2">
                  {sources.map((source) => (
                    <Link
                      key={`${source.sourceType ?? 'DOCUMENT'}-${source.articleId ?? source.documentId}-${source.chunkId}`}
                      href={localePath(locale,
                        source.link ??
                        (source.articleSlug
                          ? `/portal/knowledge/${encodeURIComponent(source.articleSlug)}`
                          : `/portal/documents/${encodeURIComponent(source.documentId ?? '')}`))}
                      className="block rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition hover:border-blue-300"
                    >
                      <span className="font-bold text-blue-700">
                        {source.sourceId ?? `${text.source} ${source.number ?? ''}`}
                      </span>

                      <span className="ml-2 text-slate-700">
                        {source.sourceTitle ?? source.documentTitle ?? source.documentName}
                      </span>

                      <span className="ml-2 text-xs font-bold uppercase text-slate-400">
                        {source.sourceType ?? 'DOCUMENT'}
                      </span>

                      {source.pageStart ? (
                        <span className="ml-2 text-xs font-bold text-slate-500">
                          {text.page} {source.pageStart}
                          {source.pageEnd && source.pageEnd !== source.pageStart
                            ? `–${source.pageEnd}`
                            : ''}
                        </span>
                      ) : null}

                      {source.excerpt ? (
                        <span className="mt-2 block text-slate-500">{source.excerpt}</span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-black text-slate-950">{text.history}</h3>

            <p className="text-sm text-slate-500">{text.latest}</p>
          </div>

          {history.length > 0 ? (
            <button
              type="button"
              onClick={clearHistory}
              className="w-fit rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
            >
              {text.clearHistory}
            </button>
          ) : null}
        </div>

        {historyLoading ? (
          <div className="px-5 py-10 text-center">
            <p className="font-semibold text-slate-600">{text.historyLoading}</p>
          </div>
        ) : history.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="font-bold text-slate-800">{text.empty}</p>

            <p className="mt-2 text-sm text-slate-500">{text.firstQuestion}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.map((item) => (
              <div key={item.id} className="px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <button type="button" onClick={() => openHistoryItem(item)} className="text-left">
                    <p className="font-black text-slate-900 hover:text-blue-700">{item.question}</p>

                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                      {item.answer}
                    </p>

                    <p className="mt-2 text-xs font-semibold text-slate-400">
                      {formatDate(item.createdAt, locale)}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteHistoryItem(item)}
                    className="w-fit rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
                  >
                    {text.delete}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
