'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

import { DocumentUpload } from '../../../components/document-upload';
import { KnowledgeAsk } from '../../../components/knowledge-ask';

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

type SearchResult = {
  documentId: string;
  documentName: string;
  chunkId: string;
  chunkIndex: number;
  snippet: string;
  matches: number;
  score: number;
  chunksFound: number;
};

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

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

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchPerformed, setSearchPerformed] = useState(false);

  useEffect(() => {
    async function loadDocuments() {
      try {
        setLoading(true);
        setLoadError('');

        const response = await fetch('/api/documents/upload', {
          cache: 'no-store',
        });

        const responseText = await response.text();

        let result: {
          documents?: DocumentItem[];
          error?: string;
        };

        try {
          result = JSON.parse(responseText);
        } catch {
          throw new Error(`Сервер вернул некорректный ответ. Код ${response.status}`);
        }

        if (!response.ok) {
          throw new Error(result.error || 'Не удалось загрузить список документов.');
        }

        setDocuments(Array.isArray(result.documents) ? result.documents : []);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : 'Не удалось загрузить список документов.',
        );
      } finally {
        setLoading(false);
      }
    }

    void loadDocuments();
  }, []);

  function handleUploaded(document: DocumentItem) {
    setDocuments((current) => [document, ...current]);
  }

  async function handleDelete(document: DocumentItem) {
    const confirmed = window.confirm(`Удалить документ «${document.name}»?`);

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/documents/upload?id=${encodeURIComponent(document.id)}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Не удалось удалить документ.');
      }

      setDocuments((current) => current.filter((item) => item.id !== document.id));

      setSearchResults((current) => current.filter((item) => item.documentId !== document.id));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось удалить документ.');
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = searchQuery.trim();

    if (query.length < 2) {
      setSearchError('Введите не менее двух символов.');
      return;
    }

    try {
      setSearching(true);
      setSearchError('');
      setSearchPerformed(true);

      const response = await fetch(`/api/documents/search?q=${encodeURIComponent(query)}`, {
        cache: 'no-store',
      });

      const responseText = await response.text();

      let result: {
        results?: SearchResult[];
        error?: string;
      };

      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(`Сервер вернул некорректный ответ. Код ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(result.error || 'Не удалось выполнить поиск.');
      }

      setSearchResults(Array.isArray(result.results) ? result.results : []);
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : 'Не удалось выполнить поиск.');
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
    setSearchPerformed(false);
  }

  const processedCount = documents.filter((document) => document.status === 'Обработан').length;

  const errorCount = documents.filter(
    (document) => document.status === 'Ошибка' || document.status === 'Карантин',
  ).length;

  return (
    <main className="p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
            Knowledge Center
          </p>

          <h2 className="mt-2 text-3xl font-black text-slate-950">База знаний Avantime</h2>

          <p className="mt-2 max-w-2xl text-slate-500">
            Загружайте документы, извлекайте текст и выполняйте поиск по базе знаний.
          </p>
        </div>

        <DocumentUpload onUploaded={handleUploaded} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-3xl font-black text-slate-950">{documents.length}</p>
          <p className="mt-1 text-sm text-slate-500">документов</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-3xl font-black text-slate-950">{processedCount}</p>
          <p className="mt-1 text-sm text-slate-500">обработано</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-3xl font-black text-slate-950">{errorCount}</p>
          <p className="mt-1 text-sm text-slate-500">ошибок</p>
        </div>
      </div>

      <KnowledgeAsk />

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-black text-slate-950">Поиск по документам</h3>

        <p className="mt-1 text-sm text-slate-500">
          Поиск выполняется по извлечённому тексту обработанных PDF.
        </p>

        <form onSubmit={handleSearch} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Введите слово или фразу"
            className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 outline-none ring-blue-200 focus:ring-4"
          />

          <button
            type="submit"
            disabled={searching}
            className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {searching ? 'Поиск…' : 'Найти'}
          </button>

          {searchPerformed ? (
            <button
              type="button"
              onClick={clearSearch}
              className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 hover:bg-slate-50"
            >
              Очистить
            </button>
          ) : null}
        </form>

        {searchError ? <p className="mt-4 font-semibold text-red-600">{searchError}</p> : null}

        {searchPerformed && !searching && !searchError ? (
          <div className="mt-6">
            <p className="text-sm font-bold text-slate-600">
              Найдено документов: {searchResults.length}
            </p>

            {searchResults.length === 0 ? (
              <p className="mt-4 text-slate-500">Совпадений не найдено.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {searchResults.map((result) => (
                  <Link
                    key={`${result.documentId}-${result.chunkId}`}
                    href={`/dashboard/knowledge/${result.documentId}`}
                    className="block rounded-2xl border border-slate-200 p-5 transition hover:border-blue-300 hover:bg-blue-50/40"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h4 className="font-black text-slate-900">{result.documentName}</h4>

                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                          Совпадений: {result.matches}
                        </span>

                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                          Фрагментов: {result.chunksFound}
                        </span>

                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                          Релевантность: {result.score}
                        </span>
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-600">{result.snippet}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-black text-slate-950">Документы</h3>

          <p className="text-sm text-slate-500">Загруженные документы</p>
        </div>

        {loading ? (
          <div className="px-5 py-14 text-center">
            <p className="font-bold text-slate-800">Загрузка документов…</p>
          </div>
        ) : loadError ? (
          <div className="px-5 py-14 text-center">
            <p className="font-bold text-red-600">{loadError}</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="font-bold text-slate-800">Документы ещё не загружены</p>

            <p className="mt-2 text-sm text-slate-500">
              Нажмите «Загрузить документ» и выберите PDF.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {documents.map((document) => (
              <div
                key={document.id}
                className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto_auto_auto_auto] md:items-center"
              >
                <div>
                  <Link
                    href={`/dashboard/knowledge/${document.id}`}
                    className="font-bold text-slate-900 hover:text-blue-700"
                  >
                    {document.name}
                  </Link>

                  <p className="mt-1 text-xs text-slate-500">
                    {document.type}
                    {document.pages ? ` · ${document.pages} стр.` : ''}
                  </p>
                </div>

                <span className="text-sm text-slate-500">{formatSize(document.size)}</span>

                <span
                  className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${
                    document.status === 'Обработан'
                      ? 'bg-emerald-50 text-emerald-700'
                      : document.status === 'Ошибка' || document.status === 'Карантин'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  {document.status}
                </span>

                <span className="text-sm text-slate-500">{formatDate(document.uploadedAt)}</span>

                <button
                  type="button"
                  onClick={() => handleDelete(document)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
