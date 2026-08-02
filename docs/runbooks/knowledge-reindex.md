# Runbook: knowledge reindex

## Preconditions

Identify the article, current source version, owner/tenant, visibility, lifecycle and approved
correlation ID. Never include article content in evidence or CLI arguments.

## Procedure

1. Confirm the primary article row is authoritative and worker generation is current.
2. Inspect its latest `KnowledgeIndexEvent`; retry only the current-version failed/DLQ event.
3. Run one bounded worker batch.
4. Verify cache old-version absence, search/vector generation equals source version and correct
   owner/visibility metadata.
5. Verify foreign tenant denial and public absence for private/organization-only data.
6. For archive/delete, verify both search and vector rows are absent.
7. Record safe versions, event ID, outcome and worker generation.

Do not directly patch search/vector rows. Repeated failure remains visible and requires provider/DB
incident handling; it is never recorded as success.

## Связанные документы

- [Knowledge indexing](../KNOWLEDGE_INDEXING.md)
- [Cache/index invalidation](../CACHE_INDEX_INVALIDATION.md)
- [Knowledge publication](./knowledge-publication.md)
