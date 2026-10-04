'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { localePath, type Locale } from '../../lib/i18n';

type DocumentItem = {
  id: string;
  name: string;
  storedName: string;
  type: string;
  size: number;
  status: string;
  uploadedAt: string;
  textFile?: string;
  pages?: number;
  textLength?: number;
  processedAt?: string;
  errorMessage?: string;
  detectedDocumentType: string;
  detectedMimeType?: string;
  detectionConfidence?: number;
  textExtractionMethod: string;
  ocrStatus: string;
  ocrLanguage?: string;
  pageCount?: number;
  extractedCharacterCount?: number;
  requiresManualReview: boolean;
  intelligenceVersion: string;
};

type ViewMode = 'pdf' | 'text';

const copy = {
  lv: { loading: 'Ielādē dokumentu…', back: '← Atgriezties zināšanu bāzē', notFound: 'Dokuments nav atrasts.', document: 'Dokuments', open: 'Atvērt oriģinālu', pdf: 'PDF', extracted: 'Izgūtais teksts', loadingText: 'Ielādē tekstu…', emptyText: 'Izgūtais teksts ir tukšs.', properties: 'Dokumenta rekvizīti', type: 'Tips', detectedType: 'Noteiktais tips', mime: 'Faktiskais MIME', extraction: 'Izgūšana / OCR', confidence: 'Pārliecība', review: 'Operatora pārbaude', required: 'Nepieciešama', notRequired: 'Nav nepieciešama', version: 'Apstrādes versija', size: 'Izmērs', status: 'Statuss', pages: 'Lappuses', characters: 'Rakstzīmes', uploaded: 'Augšupielādēts', processed: 'Apstrādāts', error: 'Apstrādes kļūda', reprocessing: 'Ievieto rindā…', reprocess: 'Apstrādāt vēlreiz', loadError: 'Neizdevās atvērt dokumentu.', textError: 'Neizdevās iegūt dokumenta tekstu.', reprocessError: 'Neizdevās sākt apstrādi.', statuses: { 'Обработан': 'Apstrādāts', 'Ошибка': 'Kļūda', 'Карантин': 'Karantīnā', 'В очереди': 'Rindā', 'Обрабатывается': 'Tiek apstrādāts' } },
  ru: { loading: 'Загрузка документа…', back: '← Вернуться в базу знаний', notFound: 'Документ не найден.', document: 'Документ', open: 'Открыть оригинал', pdf: 'PDF', extracted: 'Извлечённый текст', loadingText: 'Загрузка текста…', emptyText: 'Извлечённый текст пуст.', properties: 'Свойства документа', type: 'Тип', detectedType: 'Определённый тип', mime: 'Фактический MIME', extraction: 'Извлечение / OCR', confidence: 'Уверенность', review: 'Проверка оператором', required: 'Требуется', notRequired: 'Не требуется', version: 'Версия обработки', size: 'Размер', status: 'Статус', pages: 'Страниц', characters: 'Символов', uploaded: 'Загружен', processed: 'Обработан', error: 'Ошибка обработки', reprocessing: 'Постановка в очередь…', reprocess: 'Обработать повторно', loadError: 'Не удалось открыть документ.', textError: 'Не удалось получить текст документа.', reprocessError: 'Не удалось запустить обработку.', statuses: { 'Обработан': 'Обработан', 'Ошибка': 'Ошибка', 'Карантин': 'Карантин', 'В очереди': 'В очереди', 'Обрабатывается': 'Обрабатывается' } },
  en: { loading: 'Loading document…', back: '← Return to knowledge base', notFound: 'Document not found.', document: 'Document', open: 'Open original', pdf: 'PDF', extracted: 'Extracted text', loadingText: 'Loading text…', emptyText: 'Extracted text is empty.', properties: 'Document properties', type: 'Type', detectedType: 'Detected type', mime: 'Actual MIME', extraction: 'Extraction / OCR', confidence: 'Confidence', review: 'Operator review', required: 'Required', notRequired: 'Not required', version: 'Processing version', size: 'Size', status: 'Status', pages: 'Pages', characters: 'Characters', uploaded: 'Uploaded', processed: 'Processed', error: 'Processing error', reprocessing: 'Queuing…', reprocess: 'Process again', loadError: 'Could not open the document.', textError: 'Could not retrieve document text.', reprocessError: 'Could not start processing.', statuses: { 'Обработан': 'Processed', 'Ошибка': 'Error', 'Карантин': 'Quarantined', 'В очереди': 'Queued', 'Обрабатывается': 'Processing' } },
} satisfies Record<Locale, { loading: string; back: string; notFound: string; document: string; open: string; pdf: string; extracted: string; loadingText: string; emptyText: string; properties: string; type: string; detectedType: string; mime: string; extraction: string; confidence: string; review: string; required: string; notRequired: string; version: string; size: string; status: string; pages: string; characters: string; uploaded: string; processed: string; error: string; reprocessing: string; reprocess: string; loadError: string; textError: string; reprocessError: string; statuses: Record<string, string> }>;

function formatSize(bytes: number, locale: Locale) {
  const units = locale === 'ru' ? ['Б', 'КБ', 'МБ'] : ['B', 'KB', 'MB'];
  if (bytes < 1024) {
    return `${bytes} ${units[0]}`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} ${units[1]}`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} ${units[2]}`;
}

function formatDate(value: string | undefined, locale: Locale) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function AdminDocumentManagementDetail({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const params = useParams();
  const id = String(params.id ?? '');

  const [document, setDocument] = useState<DocumentItem | null>(null);
  const [documentText, setDocumentText] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('pdf');

  const [loading, setLoading] = useState(true);
  const [textLoading, setTextLoading] = useState(false);
  const [error, setError] = useState('');
  const [textError, setTextError] = useState('');
  const [reprocessing, setReprocessing] = useState(false);

  useEffect(() => {
    async function loadDocument() {
      try {
        setLoading(true);
        setError('');

        const response = await fetch(`/api/documents/item?id=${encodeURIComponent(id)}`, {
          cache: 'no-store',
        });

        const responseText = await response.text();

        let result: {
          document?: DocumentItem;
          error?: string;
        };

        try {
          result = JSON.parse(responseText);
        } catch {
          throw new Error(text.loadError);
        }

        if (!response.ok || !result.document) {
          throw new Error(text.loadError);
        }

        setDocument(result.document);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : text.loadError);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      void loadDocument();
    }
  }, [id, text.loadError]);

  async function loadText() {
    if (!document || documentText || textLoading) {
      return;
    }

    try {
      setTextLoading(true);
      setTextError('');

      const response = await fetch(`/api/documents/text?id=${encodeURIComponent(document.id)}`, {
        cache: 'no-store',
      });

      const responseText = await response.text();

      let result: {
        text?: string;
        error?: string;
      };

      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(text.textError);
      }

      if (!response.ok) {
        throw new Error(text.textError);
      }

      setDocumentText(typeof result.text === 'string' ? result.text : '');
    } catch (loadError) {
      setTextError(
        loadError instanceof Error ? loadError.message : text.textError,
      );
    } finally {
      setTextLoading(false);
    }
  }

  function selectTextMode() {
    setViewMode('text');
    void loadText();
  }

  async function reprocess() {
    if (!document || reprocessing) return;
    setReprocessing(true);
    setError('');
    try {
      const response = await fetch('/api/documents/reprocess', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ documentId: document.id, dryRun: false }),
      });
      if (!response.ok) throw new Error(text.reprocessError);
      setDocument({ ...document, status: 'В очереди' });
    } catch (reprocessError) {
      setError(
        reprocessError instanceof Error
          ? reprocessError.message
          : text.reprocessError,
      );
    } finally {
      setReprocessing(false);
    }
  }

  if (loading) {
    return (
      <main className="p-6 lg:p-8">
        <p className="font-bold text-slate-700">{text.loading}</p>
      </main>
    );
  }

  if (error || !document) {
    return (
      <main className="p-6 lg:p-8">
        <Link href={localePath(locale, '/admin/documents')} className="text-sm font-bold text-blue-700">
          {text.back}
        </Link>

        <p className="mt-8 font-bold text-red-600">{error || text.notFound}</p>
      </main>
    );
  }

  const fileUrl = `/api/documents/file?id=${encodeURIComponent(document.id)}`;

  const isProcessed = document.status === 'Обработан';

  return (
    <main className="p-6 lg:p-8">
      <Link href={localePath(locale, '/admin/documents')} className="text-sm font-bold text-blue-700 hover:text-blue-800">
        {text.back}
      </Link>

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">{text.document}</p>

          <h2 className="mt-2 max-w-4xl text-3xl font-black text-slate-950">{document.name}</h2>
        </div>

        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-blue-600 px-5 py-3 text-center font-bold text-white hover:bg-blue-700"
        >
          {text.open}
        </a>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex gap-2 border-b border-slate-200 p-3">
            <button
              type="button"
              onClick={() => setViewMode('pdf')}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${
                viewMode === 'pdf'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {text.pdf}
            </button>

            <button
              type="button"
              onClick={selectTextMode}
              disabled={!isProcessed}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${
                viewMode === 'text'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {text.extracted}
            </button>
          </div>

          {viewMode === 'pdf' ? (
            <iframe title={document.name} src={fileUrl} className="h-[75vh] w-full" />
          ) : (
            <div className="h-[75vh] overflow-auto p-6">
              {textLoading ? (
                <p className="font-semibold text-slate-600">{text.loadingText}</p>
              ) : textError ? (
                <p className="font-semibold text-red-600">{textError}</p>
              ) : documentText ? (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-slate-700">
                  {documentText}
                </pre>
              ) : (
                <p className="font-semibold text-slate-500">{text.emptyText}</p>
              )}
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-black text-slate-950">{text.properties}</h3>

          <dl className="mt-5 space-y-5">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{text.type}</dt>
              <dd className="mt-1 font-semibold text-slate-800">{document.type}</dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {text.detectedType}
              </dt>
              <dd className="mt-1 font-semibold text-slate-800">{document.detectedDocumentType}</dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {text.mime}
              </dt>
              <dd className="mt-1 break-all font-semibold text-slate-800">
                {document.detectedMimeType ?? '—'}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {text.extraction}
              </dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {document.textExtractionMethod} / {document.ocrStatus}
                {document.ocrLanguage ? ` (${document.ocrLanguage})` : ''}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {text.confidence}
              </dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {document.detectionConfidence === undefined
                  ? '—'
                  : `${Math.round(document.detectionConfidence * 100)}%`}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {text.review}
              </dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {document.requiresManualReview ? text.required : text.notRequired}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {text.version}
              </dt>
              <dd className="mt-1 font-semibold text-slate-800">{document.intelligenceVersion}</dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{text.size}</dt>
              <dd className="mt-1 font-semibold text-slate-800">{formatSize(document.size, locale)}</dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{text.status}</dt>
              <dd className="mt-1">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    isProcessed
                      ? 'bg-emerald-50 text-emerald-700'
                      : document.status === 'Ошибка' || document.status === 'Карантин'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  {text.statuses[document.status as keyof typeof text.statuses] ?? document.status}
                </span>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{text.pages}</dt>
              <dd className="mt-1 font-semibold text-slate-800">{document.pages ?? '—'}</dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{text.characters}</dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {document.textLength?.toLocaleString(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB') ?? '—'}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{text.uploaded}</dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {formatDate(document.uploadedAt, locale)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {text.processed}
              </dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {formatDate(document.processedAt, locale)}
              </dd>
            </div>

            {document.errorMessage ? (
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-red-400">
                  {text.error}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-red-600">{document.errorMessage}</dd>
              </div>
            ) : null}
          </dl>

          <button
            type="button"
            onClick={() => void reprocess()}
            disabled={reprocessing || document.status === 'Обрабатывается'}
            className="mt-6 w-full rounded-xl border border-blue-200 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reprocessing ? text.reprocessing : text.reprocess}
          </button>
        </aside>
      </div>
    </main>
  );
}
