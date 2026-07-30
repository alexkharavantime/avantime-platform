'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { ClientDocumentApiItem } from '../../lib/document-model';

export function PortalDocumentDetail({ id }: { id: string }) {
  const [document, setDocument] = useState<ClientDocumentApiItem | null>(null);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'preview' | 'text'>('preview');
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [textState, setTextState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/documents/item?id=${encodeURIComponent(id)}`, {
          cache: 'no-store',
        });
        if (response.status === 404) {
          if (active) setState('missing');
          return;
        }
        const result = (await response.json()) as { document?: ClientDocumentApiItem };
        if (!response.ok || !result.document) throw new Error('document-unavailable');
        if (active) {
          setDocument(result.document);
          setState('ready');
        }
      } catch {
        if (active) setState('error');
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id]);

  async function showText() {
    setMode('text');
    if (textState !== 'idle') return;
    setTextState('loading');
    try {
      const response = await fetch(`/api/documents/text?id=${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
      const result = (await response.json()) as { text?: string };
      if (!response.ok || typeof result.text !== 'string') throw new Error('text-unavailable');
      setText(result.text);
      setTextState('ready');
    } catch {
      setTextState('error');
    }
  }

  if (state === 'loading')
    return (
      <p role="status" className="p-8 font-bold">
        Загрузка документа…
      </p>
    );
  if (state === 'missing' || state === 'error' || !document) {
    return (
      <div className="p-8">
        <Link href="/portal/documents" className="font-bold text-blue-700">
          ← К документам
        </Link>
        <p className="mt-6 font-bold text-red-700">
          {state === 'missing' ? 'Документ не найден.' : 'Документ временно недоступен.'}
        </p>
      </div>
    );
  }

  const fileUrl = `/api/documents/file?id=${encodeURIComponent(id)}`;
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-blue-700">Документ</p>
          <h1 className="mt-2 break-words text-3xl font-black text-slate-950">{document.name}</h1>
        </div>
        <a
          href={fileUrl}
          download
          className="rounded-xl bg-blue-600 px-5 py-3 text-center font-bold text-white"
        >
          Скачать оригинал
        </a>
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_19rem]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex gap-2 border-b border-slate-200 p-3" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'preview'}
              onClick={() => setMode('preview')}
              className={`rounded-lg px-4 py-2 font-bold ${mode === 'preview' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
            >
              Предпросмотр
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'text'}
              disabled={document.processingStatus !== 'COMPLETED'}
              onClick={() => void showText()}
              className={`rounded-lg px-4 py-2 font-bold disabled:opacity-50 ${mode === 'text' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
            >
              Извлечённый текст
            </button>
          </div>
          {mode === 'preview' ? (
            document.mimeType === 'application/pdf' || document.mimeType.startsWith('image/') ? (
              <iframe
                title={`Предпросмотр ${document.name}`}
                src={fileUrl}
                className="h-[70vh] w-full"
              />
            ) : (
              <div className="p-8 text-slate-600">
                Для этого формата доступно безопасное скачивание.
              </div>
            )
          ) : (
            <div className="h-[70vh] overflow-auto p-6">
              {textState === 'loading' && <p role="status">Загрузка текста…</p>}
              {textState === 'error' && (
                <p role="alert" className="text-red-700">
                  Извлечённый текст временно недоступен.
                </p>
              )}
              {textState === 'ready' && (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-slate-700">
                  {text || 'Извлечённый текст пуст.'}
                </pre>
              )}
            </div>
          )}
        </section>
        <aside className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-black">Состояние обработки</h2>
          <dl className="mt-5 space-y-4 text-sm">
            {[
              ['Статус', document.status],
              ['Тип', document.detectedDocumentType],
              ['OCR', document.ocrStatus],
              ['Индекс', document.embeddingStatus],
              ['Проверка', document.requiresManualReview ? 'Требуется' : 'Не требуется'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-bold text-slate-500">{label}</dt>
                <dd className="mt-1 font-black text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-xs leading-5 text-slate-500">
            Повторная обработка и переиндексация доступны только администраторам.
          </p>
        </aside>
      </div>
    </div>
  );
}
