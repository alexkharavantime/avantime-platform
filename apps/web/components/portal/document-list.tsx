'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { ClientDocumentApiItem } from '../../lib/document-model';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function statusClass(status: ClientDocumentApiItem['processingStatus']) {
  if (status === 'COMPLETED') return 'bg-emerald-50 text-emerald-700';
  if (status === 'FAILED' || status === 'QUARANTINED') return 'bg-amber-50 text-amber-800';
  return 'bg-blue-50 text-blue-700';
}

export function PortalDocumentList() {
  const [documents, setDocuments] = useState<ClientDocumentApiItem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

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
  }, []);

  if (state === 'loading') {
    return (
      <p role="status" className="rounded-2xl bg-white p-6 font-bold">
        Загрузка документов…
      </p>
    );
  }
  if (state === 'error') {
    return (
      <p
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50 p-6 font-bold text-red-700"
      >
        Не удалось получить документы. Повторите попытку позже.
      </p>
    );
  }
  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <h2 className="text-xl font-black">Документов пока нет</h2>
        <p className="mt-2 text-slate-600">Доступные вашей компании документы появятся здесь.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="divide-y divide-slate-100">
        {documents.map((document) => (
          <Link
            key={document.id}
            href={`/portal/documents/${encodeURIComponent(document.id)}`}
            className="grid gap-3 px-5 py-5 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 md:grid-cols-[1fr_auto_auto] md:items-center"
          >
            <div>
              <h2 className="font-black text-slate-950">{document.name}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {document.type} · {formatSize(document.size)}
                {document.pageCount ? ` · ${document.pageCount} стр.` : ''}
              </p>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                OCR: {document.ocrStatus.toLowerCase()} · Индекс:{' '}
                {document.embeddingStatus.toLowerCase()}
                {document.requiresManualReview ? ' · Требуется проверка' : ''}
              </p>
            </div>
            <span
              className={`w-fit rounded-full px-3 py-1 text-xs font-black ${statusClass(document.processingStatus)}`}
            >
              {document.status}
            </span>
            <time className="text-sm text-slate-500">
              {new Date(document.updatedAt).toLocaleDateString('ru-RU')}
            </time>
          </Link>
        ))}
      </div>
    </div>
  );
}
