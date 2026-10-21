'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { DocumentUpload } from '../document-upload';
import type { ClientDocumentApiItem } from '../../lib/document-model';
import { localePath, type Locale } from '../../lib/i18n';

const copy = {
  lv: { loading: 'Ielādē dokumentus…', error: 'Neizdevās ielādēt dokumentus. Mēģiniet vēlāk.', empty: 'Dokumentu vēl nav', emptyHint: 'Šeit būs pieejami jūsu uzņēmuma dokumenti.', pages: 'lpp.', review: 'Jāpārbauda', statuses: { COMPLETED: 'Apstrādāts', FAILED: 'Kļūda', QUARANTINED: 'Karantīnā', UPLOADED: 'Augšupielādēts', QUEUED: 'Rindā', PROCESSING: 'Tiek apstrādāts', DELETED: 'Dzēsts' } },
  ru: { loading: 'Загрузка документов…', error: 'Не удалось получить документы. Повторите попытку позже.', empty: 'Документов пока нет', emptyHint: 'Здесь появятся документы, доступные вашей компании.', pages: 'стр.', review: 'Требуется проверка', statuses: { COMPLETED: 'Обработан', FAILED: 'Ошибка', QUARANTINED: 'Карантин', UPLOADED: 'Загружен', QUEUED: 'В очереди', PROCESSING: 'Обрабатывается', DELETED: 'Удалён' } },
  en: { loading: 'Loading documents…', error: 'Could not load documents. Please try again later.', empty: 'No documents yet', emptyHint: 'Documents available to your company will appear here.', pages: 'pages', review: 'Review required', statuses: { COMPLETED: 'Processed', FAILED: 'Error', QUARANTINED: 'Quarantined', UPLOADED: 'Uploaded', QUEUED: 'Queued', PROCESSING: 'Processing', DELETED: 'Deleted' } },
} satisfies Record<Locale, { loading: string; error: string; empty: string; emptyHint: string; pages: string; review: string; statuses: Record<string, string> }>;

function formatSize(bytes: number, locale: Locale) {
  const units = locale === 'ru' ? ['Б', 'КБ', 'МБ'] : ['B', 'KB', 'MB'];
  if (bytes < 1024) return `${bytes} ${units[0]}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${units[1]}`;
  return `${(bytes / 1024 / 1024).toFixed(1)} ${units[2]}`;
}

function statusClass(status: ClientDocumentApiItem['processingStatus']) {
  if (status === 'COMPLETED') return 'bg-emerald-50 text-emerald-700';
  if (status === 'FAILED' || status === 'QUARANTINED') return 'bg-amber-50 text-amber-800';
  return 'bg-blue-50 text-blue-700';
}

export function PortalDocumentList({
  locale,
  canUpload = false,
}: {
  locale: Locale;
  canUpload?: boolean;
}) {
  const text = copy[locale];
  const [documents, setDocuments] = useState<ClientDocumentApiItem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshError, setRefreshError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch('/api/documents/upload', { cache: 'no-store' });
        const result = (await response.json()) as {
          documents?: ClientDocumentApiItem[];
        };
        if (!response.ok) throw new Error('document-list-unavailable');
        if (active) {
          setDocuments(Array.isArray(result.documents) ? result.documents : []);
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
  }, [refreshVersion]);

  const hasPendingWork = documents.some(
    (document) =>
      ['UPLOADED', 'QUEUED', 'PROCESSING'].includes(document.processingStatus) ||
      ['PENDING', 'QUEUED', 'PROCESSING'].includes(document.embeddingStatus),
  );

  useEffect(() => {
    if (!hasPendingWork) return;
    let active = true;
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch('/api/documents/upload', { cache: 'no-store' });
        const result = (await response.json()) as {
          documents?: ClientDocumentApiItem[];
        };
        if (!response.ok) throw new Error('document-status-unavailable');
        if (active) {
          setDocuments(Array.isArray(result.documents) ? result.documents : []);
          setRefreshError('');
        }
      } catch {
        if (active) setRefreshError(text.error);
      }
    }, 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [hasPendingWork, text.error]);

  return (
    <>
      {canUpload ? (
        <div className="mb-5 flex justify-end">
          <DocumentUpload
            locale={locale}
            onUploaded={() => {
              setRefreshError('');
              setRefreshVersion((version) => version + 1);
            }}
          />
        </div>
      ) : null}
      {refreshError ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 font-semibold text-red-700">
          {refreshError}
        </p>
      ) : null}
      {state === 'loading' ? (
        <p role="status" className="rounded-2xl bg-white p-6 font-bold">
          {text.loading}
        </p>
      ) : state === 'error' ? (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-6 font-bold text-red-700"
        >
          {text.error}
        </p>
      ) : documents.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <h2 className="text-xl font-black">{text.empty}</h2>
          <p className="mt-2 text-slate-600">{text.emptyHint}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="divide-y divide-slate-100">
            {documents.map((document) => (
              <Link
                key={document.id}
                href={localePath(locale, `/portal/documents/${encodeURIComponent(document.id)}`)}
                className="grid gap-3 px-5 py-5 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 md:grid-cols-[1fr_auto_auto] md:items-center"
              >
                <div>
                  <h2 className="font-black text-slate-950">{document.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {document.type} · {formatSize(document.size, locale)}
                    {document.pageCount ? ` · ${document.pageCount} ${text.pages}` : ''}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    OCR: {document.ocrStatus.toLowerCase()} · Index:{' '}
                    {document.embeddingStatus.toLowerCase()}
                    {document.requiresManualReview ? ` · ${text.review}` : ''}
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full px-3 py-1 text-xs font-black ${statusClass(document.processingStatus)}`}
                >
                  {text.statuses[document.processingStatus] ?? document.status}
                </span>
                <time className="text-sm text-slate-500">
                  {new Date(document.updatedAt).toLocaleDateString(locale === 'ru' ? 'ru-RU' : locale === 'lv' ? 'lv-LV' : 'en-GB')}
                </time>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
