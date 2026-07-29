# Staging Smoke Tests

## Dataset

`apps/web/staging-data/manifest.json` declares three synthetic tenants, text PDF
in EN/LV/RU, scanned PDF, PNG/JPEG, page provenance and negative cases:
no-answer, prompt injection, cross-tenant denial, deleted/quarantined exclusion
and reindex. Generate ignored binary fixtures with:

```bash
npm run staging:dataset
```

## Local staging-like gate

```bash
npm run staging:smoke -- --integration
npm run test:ocr-integration:docker
```

The local runner covers PostgreSQL/MinIO document flow, Redis queue/fencing/rate
limits, workers, budget/audit, pgvector embeddings, hybrid retrieval, RAG,
citations, tenant isolation and cleanup. OCR remains a separate real runtime
gate.

## Managed staging gate

Using only a synthetic staging ADMIN account and allowlisted tenants, record one
correlation ID across:

1. login and ADMIN denial checks;
2. upload, object save, queue, document worker and OCR;
3. chunks, embedding worker, vector save and hybrid search;
4. RAG answer, server citations, ledger and audit;
5. reindex dry-run, rate/budget denial, soft delete and cross-tenant denial;
6. readiness/heartbeat/queue checks and cleanup.

No document text, prompt, answer or embedding may enter evidence. Local tests do
not mark the managed smoke gate passed.

## Load smoke

`npm run staging:load-smoke -- --integration` runs bounded deterministic exact
pgvector measurements. Managed staging must additionally report p50/p95/p99,
error rate, queue age, worker utilization, DB connections, Redis/vector/provider
latency, estimated cost and no-answer rate. This is capacity smoke, not a
production stress test.

## Related documents

- [Hybrid RAG](./HYBRID_RAG.md)
- [Go-Live Evidence](./GO_LIVE_EVIDENCE.md)
- [TASK-006](./tasks/TASK-006.md)
