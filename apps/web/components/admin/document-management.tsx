'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

import { DocumentUpload } from '../document-upload';
import { KnowledgeAsk } from '../knowledge-ask';
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
  embeddingStatus?: string;
};

type SearchResult = {
  documentId: string;
  documentName: string;
  chunkId: string;
  chunkIndex: number;
  preview: string;
  score: number;
  scoreComponents: {
    lexical: number;
    semantic: number;
    hybrid: number;
  };
};

const copy = {
  lv: { title: 'Avantime zināšanu bāze', description: 'Augšupielādējiet dokumentus, izgūstiet tekstu un meklējiet zināšanu bāzē.', documents: 'dokumenti', indexed: 'vektoru indeksā', processed: 'apstrādāti', errors: 'kļūdas', search: 'Meklēt dokumentos', searchDescription: 'Izvēlieties lexical, semantic vai hybrid meklēšanu apstrādātajos dokumentos.', searchLabel: 'Meklēt dokumentos', placeholder: 'Ievadiet vārdu vai frāzi', mode: 'Meklēšanas režīms', searching: 'Meklē…', find: 'Meklēt', clear: 'Notīrīt', found: 'Atrasti dokumenti:', noResults: 'Atbilstības nav atrastas.', relevance: 'Atbilstība:', list: 'Dokumenti', uploaded: 'Augšupielādētie dokumenti', loading: 'Ielādē dokumentus…', empty: 'Dokumenti vēl nav augšupielādēti', emptyHint: 'Izvēlieties PDF, izmantojot pogu “Augšupielādēt dokumentu”.', page: 'lpp.', index: 'indekss', delete: 'Dzēst', deleteConfirm: 'Dzēst dokumentu', loadError: 'Neizdevās ielādēt dokumentu sarakstu.', deleteError: 'Neizdevās dzēst dokumentu.', searchError: 'Neizdevās veikt meklēšanu.', shortQuery: 'Ievadiet vismaz divas rakstzīmes.', statuses: { 'Обработан': 'Apstrādāts', 'Ошибка': 'Kļūda', 'Карантин': 'Karantīnā', 'В очереди': 'Rindā', 'Обрабатывается': 'Tiek apstrādāts' } },
  ru: { title: 'База знаний Avantime', description: 'Загружайте документы, извлекайте текст и выполняйте поиск по базе знаний.', documents: 'документов', indexed: 'в векторном индексе', processed: 'обработано', errors: 'ошибок', search: 'Поиск по документам', searchDescription: 'Выберите лексический, семантический или гибридный поиск по обработанным документам.', searchLabel: 'Поиск по документам', placeholder: 'Введите слово или фразу', mode: 'Режим поиска', searching: 'Поиск…', find: 'Найти', clear: 'Очистить', found: 'Найдено документов:', noResults: 'Совпадений не найдено.', relevance: 'Релевантность:', list: 'Документы', uploaded: 'Загруженные документы', loading: 'Загрузка документов…', empty: 'Документы ещё не загружены', emptyHint: 'Нажмите «Загрузить документ» и выберите PDF.', page: 'стр.', index: 'индекс', delete: 'Удалить', deleteConfirm: 'Удалить документ', loadError: 'Не удалось загрузить список документов.', deleteError: 'Не удалось удалить документ.', searchError: 'Не удалось выполнить поиск.', shortQuery: 'Введите не менее двух символов.', statuses: { 'Обработан': 'Обработан', 'Ошибка': 'Ошибка', 'Карантин': 'Карантин', 'В очереди': 'В очереди', 'Обрабатывается': 'Обрабатывается' } },
  en: { title: 'Avantime knowledge base', description: 'Upload documents, extract text and search the knowledge base.', documents: 'documents', indexed: 'in vector index', processed: 'processed', errors: 'errors', search: 'Search documents', searchDescription: 'Choose lexical, semantic or hybrid retrieval across processed documents.', searchLabel: 'Search documents', placeholder: 'Enter a word or phrase', mode: 'Search mode', searching: 'Searching…', find: 'Search', clear: 'Clear', found: 'Documents found:', noResults: 'No matches found.', relevance: 'Relevance:', list: 'Documents', uploaded: 'Uploaded documents', loading: 'Loading documents…', empty: 'No documents uploaded yet', emptyHint: 'Choose a PDF using the “Upload document” button.', page: 'pages', index: 'index', delete: 'Delete', deleteConfirm: 'Delete document', loadError: 'Could not load the document list.', deleteError: 'Could not delete the document.', searchError: 'Could not search documents.', shortQuery: 'Enter at least two characters.', statuses: { 'Обработан': 'Processed', 'Ошибка': 'Error', 'Карантин': 'Quarantined', 'В очереди': 'Queued', 'Обрабатывается': 'Processing' } },
} satisfies Record<Locale, { title: string; description: string; documents: string; indexed: string; processed: string; errors: string; search: string; searchDescription: string; searchLabel: string; placeholder: string; mode: string; searching: string; find: string; clear: string; found: string; noResults: string; relevance: string; list: string; uploaded: string; loading: string; empty: string; emptyHint: string; page: string; index: string; delete: string; deleteConfirm: string; loadError: string; deleteError: string; searchError: string; shortQuery: string; statuses: Record<string, string> }>;

function formatSize(bytes: number, locale: Locale) {
  const units = locale === 'ru' ? ['Б', 'КБ', 'МБ'] : locale === 'lv' ? ['B', 'KB', 'MB'] : ['B', 'KB', 'MB'];
  if (bytes < 1024) {
    return `${bytes} ${units[0]}`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} ${units[1]}`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} ${units[2]}`;
}

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

export function AdminDocumentManagement({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'lexical' | 'semantic' | 'hybrid'>('lexical');
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
          throw new Error(text.loadError);
        }

        if (!response.ok) {
          throw new Error(text.loadError);
        }

        setDocuments(Array.isArray(result.documents) ? result.documents : []);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : text.loadError);
      } finally {
        setLoading(false);
      }
    }

    void loadDocuments();
  }, [text.loadError]);

  function handleUploaded(document: DocumentItem) {
    setDocuments((current) => [document, ...current]);
  }

  async function handleDelete(document: DocumentItem) {
    const confirmed = window.confirm(`${text.deleteConfirm} «${document.name}»?`);

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/documents/upload?id=${encodeURIComponent(document.id)}`, {
        method: 'DELETE',
        headers: { 'x-avantime-confirmation': 'DELETE DOCUMENT' },
      });

      if (!response.ok) {
        throw new Error(text.deleteError);
      }

      setDocuments((current) => current.filter((item) => item.id !== document.id));

      setSearchResults((current) => current.filter((item) => item.documentId !== document.id));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : text.deleteError);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = searchQuery.trim();

    if (query.length < 2) {
      setSearchError(text.shortQuery);
      return;
    }

    try {
      setSearching(true);
      setSearchError('');
      setSearchPerformed(true);

      const response = await fetch(
        `/api/documents/search?q=${encodeURIComponent(query)}&mode=${searchMode}`,
        {
          cache: 'no-store',
        },
      );

      const responseText = await response.text();

      let result: {
        results?: SearchResult[];
        error?: string;
      };

      try {
        result = JSON.parse(responseText);
      } catch {
          throw new Error(text.searchError);
      }

      if (!response.ok) {
        throw new Error(text.searchError);
      }

      setSearchResults(Array.isArray(result.results) ? result.results : []);
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : text.searchError);
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
  const indexedCount = documents.filter(
    (document) => document.embeddingStatus === 'COMPLETED',
  ).length;

  return (
    <main className="p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">Avantime</p>

          <h1 className="mt-2 text-3xl font-black text-slate-950">{text.title}</h1>

          <p className="mt-2 max-w-2xl text-slate-500">{text.description}</p>
        </div>

        <DocumentUpload locale={locale} onUploaded={handleUploaded} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-3xl font-black text-slate-950">{documents.length}</p>
          <p className="mt-1 text-sm text-slate-500">{text.documents}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-3xl font-black text-slate-950">{indexedCount}</p>
          <p className="mt-1 text-sm text-slate-500">{text.indexed}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-3xl font-black text-slate-950">{processedCount}</p>
          <p className="mt-1 text-sm text-slate-500">{text.processed}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-3xl font-black text-slate-950">{errorCount}</p>
          <p className="mt-1 text-sm text-slate-500">{text.errors}</p>
        </div>
      </div>

      <KnowledgeAsk locale={locale} />

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-black text-slate-950">{text.search}</h3>

        <p className="mt-1 text-sm text-slate-500">
          {text.searchDescription}
        </p>

        <form onSubmit={handleSearch} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            aria-label={text.searchLabel}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={text.placeholder}
            className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 outline-none ring-blue-200 focus:ring-4"
          />

          <select
            value={searchMode}
            onChange={(event) =>
              setSearchMode(event.target.value as 'lexical' | 'semantic' | 'hybrid')
            }
            className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-semibold text-slate-700"
            aria-label={text.mode}
          >
            <option value="lexical">Lexical</option>
            <option value="semantic">Semantic</option>
            <option value="hybrid">Hybrid</option>
          </select>

          <button
            type="submit"
            disabled={searching}
            className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {searching ? text.searching : text.find}
          </button>

          {searchPerformed ? (
            <button
              type="button"
              onClick={clearSearch}
              className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 hover:bg-slate-50"
            >
              {text.clear}
            </button>
          ) : null}
        </form>

        {searchError ? <p className="mt-4 font-semibold text-red-600">{searchError}</p> : null}

        {searchPerformed && !searching && !searchError ? (
          <div className="mt-6">
            <p className="text-sm font-bold text-slate-600">
              {text.found} {searchResults.length}
            </p>

            {searchResults.length === 0 ? (
              <p className="mt-4 text-slate-500">{text.noResults}</p>
            ) : (
              <div className="mt-4 space-y-4">
                {searchResults.map((result) => (
                  <Link
                    key={`${result.documentId}-${result.chunkId}`}
                    href={localePath(locale, `/admin/documents/${result.documentId}`)}
                    className="block rounded-2xl border border-slate-200 p-5 transition hover:border-blue-300 hover:bg-blue-50/40"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h4 className="font-black text-slate-900">{result.documentName}</h4>

                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                          Lexical: {result.scoreComponents.lexical.toFixed(2)}
                        </span>

                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                          Semantic: {result.scoreComponents.semantic.toFixed(2)}
                        </span>

                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                          {text.relevance} {result.score}
                        </span>
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-600">{result.preview}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-black text-slate-950">{text.list}</h3>

          <p className="text-sm text-slate-500">{text.uploaded}</p>
        </div>

        {loading ? (
          <div className="px-5 py-14 text-center">
            <p className="font-bold text-slate-800">{text.loading}</p>
          </div>
        ) : loadError ? (
          <div className="px-5 py-14 text-center">
            <p className="font-bold text-red-600">{loadError}</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="font-bold text-slate-800">{text.empty}</p>

            <p className="mt-2 text-sm text-slate-500">{text.emptyHint}</p>
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
                    href={localePath(locale, `/admin/documents/${document.id}`)}
                    className="font-bold text-slate-900 hover:text-blue-700"
                  >
                    {document.name}
                  </Link>

                  <p className="mt-1 text-xs text-slate-500">
                    {document.type}
                    {document.pages ? ` · ${document.pages} ${text.page}` : ''}
                    {document.embeddingStatus
                      ? ` · ${text.index}: ${document.embeddingStatus.toLowerCase()}`
                      : ''}
                  </p>
                </div>

                <span className="text-sm text-slate-500">{formatSize(document.size, locale)}</span>

                <span
                  className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${
                    document.status === 'Обработан'
                      ? 'bg-emerald-50 text-emerald-700'
                      : document.status === 'Ошибка' || document.status === 'Карантин'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  {text.statuses[document.status as keyof typeof text.statuses] ?? document.status}
                </span>

                <span className="text-sm text-slate-500">{formatDate(document.uploadedAt, locale)}</span>

                <button
                  type="button"
                  onClick={() => handleDelete(document)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
                >
                  {text.delete}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
