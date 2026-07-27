'use client';

import { FormEvent, useRef, useState } from 'react';

const INITIAL_ANSWER =
  'Опишите задачу — я предложу первый практический шаг.';

export function AIDemo() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(INITIAL_ANSWER);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = question.trim();

    if (!prompt || isLoading) {
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError('');
    setAnswer('AI анализирует задачу…');

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      const data = (await response.json()) as {
        text?: string;
      };

      if (!response.ok) {
        throw new Error(data.text || 'Не удалось получить ответ.');
      }

      setAnswer(data.text || 'AI не вернул текстовый ответ.');
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === 'AbortError'
      ) {
        setAnswer('Работа AI остановлена пользователем.');
        setError('');
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Произошла неизвестная ошибка.',
      );
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  function handleNewQuestion() {
    abortControllerRef.current?.abort();

    setQuestion('');
    setAnswer(INITIAL_ANSWER);
    setError('');
    setIsLoading(false);

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative mx-auto w-full max-w-xl rounded-[2rem] border border-white bg-slate-950 p-5 text-white shadow-2xl shadow-blue-950/25 sm:p-7"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 font-black">
            AI
          </span>

          <div>
            <p className="font-bold">Avantime Assistant</p>
            <p className="text-xs text-slate-400">Анализ бизнес-задачи</p>
          </div>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            isLoading
              ? 'bg-amber-400/10 text-amber-300'
              : 'bg-emerald-400/10 text-emerald-300'
          }`}
        >
          {isLoading ? 'работает' : 'online'}
        </span>
      </div>

      <div className="space-y-4 py-6">
        <textarea
          ref={textareaRef}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Опишите задачу, например: почему остановился обмен 1С?"
          rows={4}
          disabled={isLoading}
          className="w-full resize-none rounded-2xl border border-white/10 bg-white/10 p-4 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-70"
        />

        <button
          type="submit"
          disabled={isLoading || !question.trim()}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 font-bold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'AI анализирует…' : 'Получить рекомендацию'}
        </button>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleStop}
            disabled={!isLoading}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-5 font-bold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Остановить
          </button>

          <button
            type="button"
            onClick={handleNewQuestion}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 font-bold text-slate-200 transition hover:bg-white/10"
          >
            Новый вопрос
          </button>
        </div>

        {error ? (
          <div className="rounded-2xl bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : (
          <div className="whitespace-pre-wrap rounded-2xl bg-white/10 p-4 text-sm leading-6 text-slate-200">
            {answer}
          </div>
        )}
      </div>
    </form>
  );
}