'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

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
};

type ViewMode = 'pdf' | 'text';

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function formatDate(value?: string) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function DocumentPage() {
  const params = useParams();
  const id = String(params.id ?? '');

  const [document, setDocument] = useState<DocumentItem | null>(null);
  const [documentText, setDocumentText] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('pdf');

  const [loading, setLoading] = useState(true);
  const [textLoading, setTextLoading] = useState(false);
  const [error, setError] = useState('');
  const [textError, setTextError] = useState('');

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
          throw new Error(`Сервер вернул некорректный ответ. Код ${response.status}`);
        }

        if (!response.ok || !result.document) {
          throw new Error(result.error || 'Не удалось открыть документ.');
        }

        setDocument(result.document);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Не удалось открыть документ.');
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      void loadDocument();
    }
  }, [id]);

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
        throw new Error(`Сервер вернул некорректный ответ. Код ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(result.error || 'Не удалось получить текст документа.');
      }

      setDocumentText(typeof result.text === 'string' ? result.text : '');
    } catch (loadError) {
      setTextError(
        loadError instanceof Error ? loadError.message : 'Не удалось получить текст документа.',
      );
    } finally {
      setTextLoading(false);
    }
  }

  function selectTextMode() {
    setViewMode('text');
    void loadText();
  }

  if (loading) {
    return (
      <main className="p-6 lg:p-8">
        <p className="font-bold text-slate-700">Загрузка документа…</p>
      </main>
    );
  }

  if (error || !document) {
    return (
      <main className="p-6 lg:p-8">
        <Link href="/dashboard/knowledge" className="text-sm font-bold text-blue-700">
          ← Вернуться в Knowledge Center
        </Link>

        <p className="mt-8 font-bold text-red-600">{error || 'Документ не найден.'}</p>
      </main>
    );
  }

  const fileUrl = `/api/documents/file?id=${encodeURIComponent(document.id)}`;

  const isProcessed = document.status === 'Обработан';

  return (
    <main className="p-6 lg:p-8">
      <Link
        href="/dashboard/knowledge"
        className="text-sm font-bold text-blue-700 hover:text-blue-800"
      >
        ← Вернуться в Knowledge Center
      </Link>

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">Документ</p>

          <h2 className="mt-2 max-w-4xl text-3xl font-black text-slate-950">{document.name}</h2>
        </div>

        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-blue-600 px-5 py-3 text-center font-bold text-white hover:bg-blue-700"
        >
          Открыть PDF
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
              PDF
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
              Извлечённый текст
            </button>
          </div>

          {viewMode === 'pdf' ? (
            <iframe title={document.name} src={fileUrl} className="h-[75vh] w-full" />
          ) : (
            <div className="h-[75vh] overflow-auto p-6">
              {textLoading ? (
                <p className="font-semibold text-slate-600">Загрузка текста…</p>
              ) : textError ? (
                <p className="font-semibold text-red-600">{textError}</p>
              ) : documentText ? (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-slate-700">
                  {documentText}
                </pre>
              ) : (
                <p className="font-semibold text-slate-500">Извлечённый текст пуст.</p>
              )}
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-black text-slate-950">Свойства документа</h3>

          <dl className="mt-5 space-y-5">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Тип</dt>
              <dd className="mt-1 font-semibold text-slate-800">{document.type}</dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Размер</dt>
              <dd className="mt-1 font-semibold text-slate-800">{formatSize(document.size)}</dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Статус</dt>
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
                  {document.status}
                </span>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Страниц</dt>
              <dd className="mt-1 font-semibold text-slate-800">{document.pages ?? '—'}</dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Символов</dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {document.textLength?.toLocaleString('ru-RU') ?? '—'}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Загружен</dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {formatDate(document.uploadedAt)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Обработан
              </dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {formatDate(document.processedAt)}
              </dd>
            </div>

            {document.errorMessage ? (
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-red-400">
                  Ошибка обработки
                </dt>
                <dd className="mt-1 text-sm font-semibold text-red-600">{document.errorMessage}</dd>
              </div>
            ) : null}
          </dl>
        </aside>
      </div>
    </main>
  );
}
