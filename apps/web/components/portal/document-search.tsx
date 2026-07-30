'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

type SearchResult = {
  documentId: string;
  documentName: string;
  chunkId: string;
  preview: string;
  score: number;
};

export function PortalDocumentSearch() {
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
        `/api/documents/search?mode=hybrid&q=${encodeURIComponent(normalized)}`,
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
      <h2 className="text-xl font-black">Поиск по документам</h2>
      <p className="mt-2 text-sm text-slate-600">
        Поиск выполняется только по документам вашей компании.
      </p>
      <form onSubmit={search} role="search" className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="portal-document-search">
          Поисковый запрос
        </label>
        <input
          id="portal-document-search"
          value={query}
          minLength={2}
          required
          onChange={(event) => setQuery(event.target.value)}
          className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          placeholder="Введите слово или фразу"
        />
        <button
          disabled={state === 'loading'}
          className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white disabled:opacity-60"
        >
          {state === 'loading' ? 'Поиск…' : 'Найти'}
        </button>
      </form>
      {state === 'error' && (
        <p role="alert" className="mt-4 font-bold text-red-700">
          Поиск временно недоступен.
        </p>
      )}
      {state === 'ready' && results.length === 0 && (
        <p className="mt-5 text-slate-600">По вашему запросу ничего не найдено.</p>
      )}
      {results.length > 0 && (
        <ul className="mt-5 space-y-3">
          {results.map((result) => (
            <li key={`${result.documentId}-${result.chunkId}`}>
              <Link
                href={`/portal/documents/${encodeURIComponent(result.documentId)}?chunk=${encodeURIComponent(result.chunkId)}`}
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
