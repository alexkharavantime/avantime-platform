'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { ClientDocumentApiItem } from '../../lib/document-model';
import { localePath, type Locale } from '../../lib/i18n';

const copy = {
  lv: { loading: 'Ielādē dokumentu…', back: '← Pie dokumentiem', missing: 'Dokuments nav atrasts.', unavailable: 'Dokuments īslaicīgi nav pieejams.', document: 'Dokuments', download: 'Lejupielādēt oriģinālu', preview: 'Priekšskatījums', extracted: 'Izgūtais teksts', safeDownload: 'Šim formātam pieejama droša lejupielāde.', loadingText: 'Ielādē tekstu…', textError: 'Izgūtais teksts īslaicīgi nav pieejams.', emptyText: 'Izgūtais teksts ir tukšs.', processing: 'Apstrādes statuss', status: 'Statuss', type: 'Tips', ocr: 'OCR', index: 'Indekss', review: 'Pārbaude', required: 'Nepieciešama', notRequired: 'Nav nepieciešama', note: 'Atkārtota apstrāde un indeksēšana pieejama pilnvarotiem uzņēmuma dalībniekiem.', statuses: { COMPLETED: 'Apstrādāts', FAILED: 'Kļūda', QUARANTINED: 'Karantīnā', UPLOADED: 'Augšupielādēts', QUEUED: 'Rindā', PROCESSING: 'Tiek apstrādāts', DELETED: 'Dzēsts' } },
  ru: { loading: 'Загрузка документа…', back: '← К документам', missing: 'Документ не найден.', unavailable: 'Документ временно недоступен.', document: 'Документ', download: 'Скачать оригинал', preview: 'Предпросмотр', extracted: 'Извлечённый текст', safeDownload: 'Для этого формата доступно безопасное скачивание.', loadingText: 'Загрузка текста…', textError: 'Извлечённый текст временно недоступен.', emptyText: 'Извлечённый текст пуст.', processing: 'Состояние обработки', status: 'Статус', type: 'Тип', ocr: 'OCR', index: 'Индекс', review: 'Проверка', required: 'Требуется', notRequired: 'Не требуется', note: 'Повторная обработка и переиндексация доступны уполномоченным участникам компании.', statuses: { COMPLETED: 'Обработан', FAILED: 'Ошибка', QUARANTINED: 'Карантин', UPLOADED: 'Загружен', QUEUED: 'В очереди', PROCESSING: 'Обрабатывается', DELETED: 'Удалён' } },
  en: { loading: 'Loading document…', back: '← Back to documents', missing: 'Document not found.', unavailable: 'The document is temporarily unavailable.', document: 'Document', download: 'Download original', preview: 'Preview', extracted: 'Extracted text', safeDownload: 'Secure download is available for this format.', loadingText: 'Loading text…', textError: 'Extracted text is temporarily unavailable.', emptyText: 'Extracted text is empty.', processing: 'Processing status', status: 'Status', type: 'Type', ocr: 'OCR', index: 'Index', review: 'Review', required: 'Required', notRequired: 'Not required', note: 'Reprocessing and reindexing are available to authorized company members.', statuses: { COMPLETED: 'Processed', FAILED: 'Error', QUARANTINED: 'Quarantined', UPLOADED: 'Uploaded', QUEUED: 'Queued', PROCESSING: 'Processing', DELETED: 'Deleted' } },
} satisfies Record<Locale, { loading: string; back: string; missing: string; unavailable: string; document: string; download: string; preview: string; extracted: string; safeDownload: string; loadingText: string; textError: string; emptyText: string; processing: string; status: string; type: string; ocr: string; index: string; review: string; required: string; notRequired: string; note: string; statuses: Record<string, string> }>;

export function PortalDocumentDetail({
  id,
  locale,
  initialDocument,
}: {
  id: string;
  locale: Locale;
  initialDocument?: ClientDocumentApiItem | null;
}) {
  const textCopy = copy[locale];
  const [document, setDocument] = useState<ClientDocumentApiItem | null>(initialDocument ?? null);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'preview' | 'text'>('preview');
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>(
    initialDocument === undefined ? 'loading' : initialDocument ? 'ready' : 'missing',
  );
  const [textState, setTextState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    if (initialDocument !== undefined) return;
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
  }, [id, initialDocument]);

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
        {textCopy.loading}
      </p>
    );
  if (state === 'missing' || state === 'error' || !document) {
    return (
      <div className="p-8">
        <Link href={localePath(locale, '/portal/documents')} className="font-bold text-blue-700">
          {textCopy.back}
        </Link>
        <p className="mt-6 font-bold text-red-700">
          {state === 'missing' ? textCopy.missing : textCopy.unavailable}
        </p>
      </div>
    );
  }

  const fileUrl = `/api/documents/file?id=${encodeURIComponent(id)}`;
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-blue-700">{textCopy.document}</p>
          <h1 className="mt-2 break-words text-3xl font-black text-slate-950">{document.name}</h1>
        </div>
        <a
          href={fileUrl}
          download
          className="rounded-xl bg-blue-600 px-5 py-3 text-center font-bold text-white"
        >
          {textCopy.download}
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
              {textCopy.preview}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'text'}
              disabled={document.processingStatus !== 'COMPLETED'}
              onClick={() => void showText()}
              className={`rounded-lg px-4 py-2 font-bold disabled:opacity-50 ${mode === 'text' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
            >
              {textCopy.extracted}
            </button>
          </div>
          {mode === 'preview' ? (
            document.mimeType === 'application/pdf' || document.mimeType.startsWith('image/') ? (
              <iframe
                title={`${textCopy.preview} ${document.name}`}
                src={fileUrl}
                className="h-[70vh] w-full"
              />
            ) : (
              <div className="p-8 text-slate-600">
                {textCopy.safeDownload}
              </div>
            )
          ) : (
            <div className="h-[70vh] overflow-auto p-6">
              {textState === 'loading' && <p role="status">{textCopy.loadingText}</p>}
              {textState === 'error' && (
                <p role="alert" className="text-red-700">
                  {textCopy.textError}
                </p>
              )}
              {textState === 'ready' && (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-slate-700">
                  {text || textCopy.emptyText}
                </pre>
              )}
            </div>
          )}
        </section>
        <aside className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-black">{textCopy.processing}</h2>
          <dl className="mt-5 space-y-4 text-sm">
            {[
              [textCopy.status, textCopy.statuses[document.processingStatus] ?? document.status],
              [textCopy.type, document.detectedDocumentType],
              [textCopy.ocr, document.ocrStatus],
              [textCopy.index, document.embeddingStatus],
              [textCopy.review, document.requiresManualReview ? textCopy.required : textCopy.notRequired],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-bold text-slate-500">{label}</dt>
                <dd className="mt-1 font-black text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-xs leading-5 text-slate-500">
            {textCopy.note}
          </p>
        </aside>
      </div>
    </div>
  );
}
