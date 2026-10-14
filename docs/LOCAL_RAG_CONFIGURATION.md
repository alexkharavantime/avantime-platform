# Local RAG configuration

## Canonical document data directory

The local web app and both document workers resolve `DOCUMENT_DATA_DIR` through
`apps/web/lib/document-data-directory.ts`. With no explicit path, it resolves to
`apps/web/.data` beneath the repository root, whether the process starts from the root or
`apps/web`. A relative `DOCUMENT_DATA_DIR` is also resolved from the repository root; an
absolute path is preserved.

The local manual profile uses filesystem storage for PDFs, extracted text, chunks and
history, with PostgreSQL metadata and vectors. This keeps the existing local history and
the corresponding document objects together while using the existing database index.
The standard profile defaults to `apps/web/.data`; an explicitly configured absolute
`DOCUMENT_DATA_DIR` remains authoritative, including the existing `.data/manual-check`
path used by the diagnostic runbook. Neither directory is copied or removed by startup.

## Reproducible local profiles

From the repository root:

```powershell
npm run dev --workspace=@avantime/web
```

This starts the guarded real-provider profile. It loads the repository-root `.env` when
present, uses OpenAI embeddings (`text-embedding-3-small`, 1536 dimensions,
`embedding-v1`) and answers, selects PostgreSQL metadata, pgvector and the PostgreSQL AI
usage ledger, and sets one provider attempt. It validates the database budget policy and
pgvector readiness before starting Next.js. It does not start either worker, create an
embedding, submit a question or re-index a document.

The fake provider is opt-in:

```powershell
npm run dev:fake --workspace=@avantime/web
```

This profile uses fake providers and an in-memory vector store. Its responses are for
local UI and flow testing only; they do not establish real retrieval or answer quality.

The document workers use the same guarded real profile and canonical data directory:

```powershell
npm run documents:worker --workspace=@avantime/web
npm run documents:embedding-worker --workspace=@avantime/web
```

Workers are started only by these explicit commands. The embedding worker can process
queued jobs; do not start it as part of a read-only check or when no embedding work is
authorized.

## Budget preflight

For tenant `avantime`, an `AiBudgetPolicy` row takes precedence over the environment
defaults `AI_DAILY_BUDGET_EUR` and `AI_MONTHLY_BUDGET_EUR`. The real-provider launcher
requires both effective limits to be positive and checks them without writing to the
ledger. A zero value means that the corresponding limit is not enforced; if either
effective daily or monthly limit is zero, startup is refused with a configuration error.
The PostgreSQL cost controller also refuses reservations when no finite daily, monthly or
provider limit is available.

The OpenAI key is read from the local environment and is never included in the launch
summary. The launch summary reports provider, vector store, data path, database target,
models, dimensions, attempt counts and effective budget limits only.

## Related documents

- [Local manual PDF check](./LOCAL_MANUAL_PDF_CHECK.md)
- [PDF search quality check](./PDF_SEARCH_QUALITY_CHECK.md)
- [AI Cost Control](./AI_COST_CONTROL.md)
- [Document Operations](./DOCUMENT_OPERATIONS.md)
