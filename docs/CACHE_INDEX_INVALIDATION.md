# Cache, search and RAG invalidation validation

The managed observation records hashes only: synthetic article/company/old cache key, version
before/after, cache eviction, search/vector update, archive stale-result absence, public-cache
absence for tenant-private data, foreign-tenant denial, idempotent retry and visible failed reindex.
Every boolean is required; a silent or partial success fails closed.

Polling is bounded to 120 seconds with an explicit interval and attempt/duration evidence. Tests
inject clock/wait functions; managed adapters poll observable backend generations and never add an
arbitrary sleep.

Knowledge article search currently queries PostgreSQL with audience filters. There is no separate
article cache/CDN invalidator or article vector/RAG index in the repository. Document RAG remains
tenant-fenced but is not evidence that knowledge publication was invalidated. Consequently the
managed knowledge invalidation gate remains `BLOCKED` until those adapters expose measurable
versions and failure state.
