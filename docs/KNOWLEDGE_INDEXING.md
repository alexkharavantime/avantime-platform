# Knowledge cache, search and vector indexing

## Durable pipeline

The `KnowledgeArticle` trigger writes a `KnowledgeIndexEvent` in the same database transaction when
version, ownership, tenant, visibility, lifecycle or quarantine changes. Events use independent
`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `DEAD_LETTER` states and lease/retry semantics; they
are not mixed with notification delivery.

The worker always invalidates versioned Redis keys first. It then reads the current primary row:

- an event older than the current article version cannot overwrite a new index;
- `DRAFT`, `REVIEW`, `ARCHIVED`, `PRIVATE` or quarantined data removes search/vector records;
- an eligible `PUBLISHED` row upserts PostgreSQL full-text metadata and a real pgvector embedding;
- embedding comes through the existing AI Gateway: deterministic only in explicit local/CI mode,
  configured provider in managed staging;
- every upsert/remove is fenced by `sourceVersion`, idempotent and retryable.

## Read boundary

Redis keys include environment namespace, tenant/platform owner, article ID and exact source
version. Cache reads require the current primary version. PostgreSQL search joins the live article
and requires identical versions. Vector reads repeat version/quarantine and audience checks.
Foreign organization, private, archived and stale records therefore return no result even if a
backend cleanup is delayed.

## Operational visibility

`KnowledgeIndexWorkerHeartbeat` records worker version, deployment generation, batch size and safe
failure code. Failed/DLQ records remain queryable. `/ready` checks pgvector/table availability and a
fresh matching-generation worker; protected diagnostics report only counts.

```bash
npm run staging:knowledge-worker -- --once
npm run staging:worker-health -- knowledge
```

Reindex is performed by creating/retrying the durable current-version event; operators must not
manually edit index tables. See the runbook for cleanup and evidence.

## Scope limitation

TASK-015 does not replace the document retrieval algorithm or merge the two knowledge domains.
Managed provider quality, relevance evaluation and complete historical backfill require separate
evidence. The adapter is a real PostgreSQL/pgvector implementation, not a simulated success.

## Связанные документы

- [Cache/index invalidation](./CACHE_INDEX_INVALIDATION.md)
- [Knowledge reindex runbook](./runbooks/knowledge-reindex.md)
- [Knowledge governance](./KNOWLEDGE_GOVERNANCE.md)
- [Hybrid RAG](./HYBRID_RAG.md)
