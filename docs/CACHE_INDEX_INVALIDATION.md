# Cache, search and RAG invalidation validation

The managed observation records hashes only: synthetic article/company/old cache key, version
before/after, cache eviction, search/vector update, archive stale-result absence, public-cache
absence for tenant-private data, foreign-tenant denial, idempotent retry and visible failed reindex.
Every boolean is required; a silent or partial success fails closed.

Polling is bounded to 120 seconds with an explicit interval and attempt/duration evidence. Tests
inject clock/wait functions; managed adapters poll observable backend generations and never add an
arbitrary sleep.

TASK-015 adds Redis versioned article cache keys, a PostgreSQL full-text index, a pgvector article
index and a separate durable invalidation worker. Every adapter exposes source/generation versions,
ownership/visibility metadata and failed/DLQ state. Repository/local validation is therefore
available; the managed gate remains `PENDING` until those adapters and the configured embedding
provider are observed in the external staging environment.
