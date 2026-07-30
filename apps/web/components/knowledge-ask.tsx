'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

type AnswerSource = {
  number?: number;
  sourceId?: string;
  documentId: string;
  documentName?: string;
  documentTitle?: string;
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

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function KnowledgeAsk() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<AnswerSource[]>([]);

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
          throw new Error(result.error || 'Не удалось загрузить историю вопросов.');
        }

        setHistory(Array.isArray(result.history) ? result.history : []);
      } catch (historyError) {
        console.error('Knowledge history load error:', historyError);
      } finally {
        setHistoryLoading(false);
      }
    }

    void loadHistory();
  }, []);

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
      throw new Error(result.error || 'Не удалось сохранить вопрос в истории.');
    }

    setHistory((current) => [result.item as HistoryItem, ...current]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedQuestion = question.trim();

    if (normalizedQuestion.length < 3) {
      setError('Введите вопрос не короче трёх символов.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setAnswer('');
      setSources([]);

      const askResponse = await fetch('/api/documents/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: normalizedQuestion,
        }),
      });

      const askText = await askResponse.text();

      let askResult: {
        answer?: string;
        citations?: AnswerSource[];
        status?: 'answered' | 'no_answer';
        error?: string;
      };

      try {
        askResult = JSON.parse(askText);
      } catch {
        throw new Error(`AI вернул некорректный ответ. Код ${askResponse.status}`);
      }

      if (!askResponse.ok) {
        throw new Error(askResult.error || 'Не удалось получить ответ AI.');
      }

      const newAnswer = askResult.answer?.trim() ?? '';

      const newSources = Array.isArray(askResult.citations) ? askResult.citations : [];

      if (!newAnswer) {
        throw new Error('AI не вернул текст ответа.');
      }

      setAnswer(newAnswer);
      setSources(newSources);

      try {
        await saveToHistory(normalizedQuestion, newAnswer, newSources);
      } catch (historyError) {
        console.error('Knowledge history save error:', historyError);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Не удалось получить ответ AI.',
      );
    } finally {
      setLoading(false);
    }
  }

  function openHistoryItem(item: HistoryItem) {
    setQuestion(item.question);
    setAnswer(item.answer);
    setSources(item.sources);
    setError('');

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  async function deleteHistoryItem(item: HistoryItem) {
    const confirmed = window.confirm(`Удалить вопрос «${item.question}» из истории?`);

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/documents/history?id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Не удалось удалить запись истории.');
      }

      setHistory((current) => current.filter((historyItem) => historyItem.id !== item.id));
    } catch (deleteError) {
      window.alert(
        deleteError instanceof Error ? deleteError.message : 'Не удалось удалить запись истории.',
      );
    }
  }

  async function clearHistory() {
    const confirmed = window.confirm('Очистить всю историю вопросов?');

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch('/api/documents/history', {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Не удалось очистить историю.');
      }

      setHistory([]);
    } catch (clearError) {
      window.alert(
        clearError instanceof Error ? clearError.message : 'Не удалось очистить историю.',
      );
    }
  }

  function clearAnswer() {
    setQuestion('');
    setAnswer('');
    setSources([]);
    setError('');
  }

  return (
    <>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
            AI Consultant
          </p>

          <h3 className="mt-2 text-xl font-black text-slate-950">Задать вопрос базе знаний</h3>

          <p className="mt-1 text-sm text-slate-500">
            AI найдёт подходящие фрагменты документов и подготовит ответ со ссылками на источники.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            placeholder="Например: какие функции должен выполнять AI-консультант?"
            className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3 outline-none ring-blue-200 focus:ring-4"
          />

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'AI готовит ответ…' : 'Получить ответ AI'}
            </button>

            {answer || error ? (
              <button
                type="button"
                onClick={clearAnswer}
                disabled={loading}
                className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 hover:bg-slate-50"
              >
                Очистить
              </button>
            ) : null}
          </div>
        </form>

        {error ? (
          <div className="mt-5 rounded-xl bg-red-50 p-4">
            <p className="font-semibold text-red-700">{error}</p>
          </div>
        ) : null}

        {answer ? (
          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
            <h4 className="font-black text-slate-950">Ответ AI</h4>

            <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {answer}
            </div>

            {sources.length > 0 ? (
              <div className="mt-6 border-t border-blue-100 pt-4">
                <p className="text-sm font-black text-slate-900">Источники</p>

                <div className="mt-3 space-y-2">
                  {sources.map((source) => (
                    <Link
                      key={`${source.documentId}-${source.chunkId}`}
                      href={
                        source.link ?? `/portal/documents/${encodeURIComponent(source.documentId)}`
                      }
                      className="block rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition hover:border-blue-300"
                    >
                      <span className="font-bold text-blue-700">
                        {source.sourceId ?? `Источник ${source.number ?? ''}`}
                      </span>

                      <span className="ml-2 text-slate-700">
                        {source.documentTitle ?? source.documentName}
                      </span>

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
            <h3 className="font-black text-slate-950">История вопросов</h3>

            <p className="text-sm text-slate-500">Последние ответы AI-консультанта</p>
          </div>

          {history.length > 0 ? (
            <button
              type="button"
              onClick={clearHistory}
              className="w-fit rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
            >
              Очистить историю
            </button>
          ) : null}
        </div>

        {historyLoading ? (
          <div className="px-5 py-10 text-center">
            <p className="font-semibold text-slate-600">Загрузка истории…</p>
          </div>
        ) : history.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="font-bold text-slate-800">История пока пуста</p>

            <p className="mt-2 text-sm text-slate-500">Задайте первый вопрос базе знаний.</p>
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
                      {formatDate(item.createdAt)}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteHistoryItem(item)}
                    className="w-fit rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
                  >
                    Удалить
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
