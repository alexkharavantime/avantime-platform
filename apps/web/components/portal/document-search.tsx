'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { localePath, type Locale } from '../../lib/i18n';

type SearchResult = {
  documentId: string;
  documentName: string;
  chunkId: string;
  preview: string;
  score: number;
};

const copy = {
  lv: { title: 'Meklēt dokumentos', description: 'Meklēšana notiek tikai jūsu uzņēmuma dokumentos.', label: 'Meklēšanas vaicājums', placeholder: 'Ievadiet vārdu vai frāzi', loading: 'Meklē…', search: 'Meklēt', error: 'Meklēšana īslaicīgi nav pieejama.', empty: 'Nekas netika atrasts.' },
  ru: { title: 'Поиск по документам', description: 'Поиск выполняется только по документам вашей компании.', label: 'Поисковый запрос', placeholder: 'Введите слово или фразу', loading: 'Поиск…', search: 'Найти', error: 'Поиск временно недоступен.', empty: 'По вашему запросу ничего не найдено.' },
  en: { title: 'Search documents', description: 'Search runs only across your company documents.', label: 'Search query', placeholder: 'Enter a word or phrase', loading: 'Searching…', search: 'Search', error: 'Search is temporarily unavailable.', empty: 'No results found for your query.' },
} satisfies Record<Locale, { title: string; description: string; label: string; placeholder: string; loading: string; search: string; error: string; empty: string }>;

export function PortalDocumentSearch({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    if (normalized.length < 2) return;
    setState('loading');
    try {
      const response = await fetch(
        `/api/documents/search?mode=lexical&q=${encodeURIComponent(normalized)}`,
        { cache: 'no-store' },
      );
      const result = (await response.json()) as { results?: SearchResult[] };
      if (!response.ok) throw new Error('search-unavailable');
      setResults(Array.isArray(result.results) ? result.results : []);
      setState('ready');
    } catch {
      setResults([]);
      setState('error');
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-black">{text.title}</h2>
      <p className="mt-2 text-sm text-slate-600">
        {text.description}
      </p>
      <form onSubmit={search} role="search" className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="portal-document-search">
          {text.label}
        </label>
        <input
          id="portal-document-search"
          value={query}
          minLength={2}
          required
          onChange={(event) => setQuery(event.target.value)}
          className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          placeholder={text.placeholder}
        />
        <button
          disabled={state === 'loading'}
          className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white disabled:opacity-60"
        >
          {state === 'loading' ? text.loading : text.search}
        </button>
      </form>
      {state === 'error' && (
        <p role="alert" className="mt-4 font-bold text-red-700">
          {text.error}
        </p>
      )}
      {state === 'ready' && results.length === 0 && (
        <p className="mt-5 text-slate-600">{text.empty}</p>
      )}
      {results.length > 0 && (
        <ul className="mt-5 space-y-3">
          {results.map((result) => (
            <li key={`${result.documentId}-${result.chunkId}`}>
              <Link
                href={localePath(locale, `/portal/documents/${encodeURIComponent(result.documentId)}?chunk=${encodeURIComponent(result.chunkId)}`)}
                className="block rounded-xl border border-slate-200 p-4 transition hover:border-blue-300"
              >
                <strong>{result.documentName}</strong>
                <p className="mt-2 text-sm leading-6 text-slate-600">{result.preview}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
