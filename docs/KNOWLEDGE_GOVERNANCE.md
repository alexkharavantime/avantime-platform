# Knowledge ownership and visibility governance

## Source of truth

Every `KnowledgeArticle` has immutable `ownerScope`, optional organization owner, explicit
`visibility`, lifecycle status, optimistic version, classification evidence and optional
quarantine timestamp.

Owner scopes are `PLATFORM`, `ORGANIZATION`, `SYSTEM` and `LEGACY_UNCLASSIFIED`. Visibility is
`PRIVATE`, `ORGANIZATION`, `PLATFORM` or `PUBLIC`. Lifecycle is `DRAFT`, `REVIEW`, `PUBLISHED` or
`ARCHIVED`.

Missing/legacy-unclassified ownership, quarantine, archived state and unpublished state deny
normal reads. Organization content is selected only by the company from a validated session.
Platform content reaches organization users only with `PLATFORM` or `PUBLIC` visibility. Public
routes select only `PUBLISHED + PUBLIC` and never infer visibility from a slug or client company.

## Publication rules

- DRAFT and REVIEW are unavailable to ordinary MEMBER/VIEWER users.
- REVIEW is available only to reviewers with action-specific permission.
- ARCHIVED is excluded from public, portal and normal search results.
- Platform publication uses `platform.knowledge.publish`; visibility uses a separate permission.
- Organization publication uses organization permissions and immutable company ownership.
- Organization → PUBLIC requires `KNOWLEDGE_VISIBILITY_PUBLIC` approval with the article ID,
  company, version and canonical safe parameters in the fingerprint.
- The article stores the executed approval ID; a database constraint denies organization PUBLIC
  visibility without it. Returning to PRIVATE/ORGANIZATION clears the current publication link,
  while immutable approval/audit history remains.
- Organization content cannot use PLATFORM visibility; platform content cannot masquerade as
  organization content.

## Legacy migration and quarantine

The legacy `KnowledgeArticle` collection was globally administered, so deterministic provenance
classifies it as platform-owned. Lifecycle status alone is not visibility evidence: every legacy
row becomes PRIVATE pending explicit review, including rows previously marked PUBLISHED. Every
row receives a fixed evidence code. Data, identifiers and lifecycle status are unchanged.

Any future import lacking deterministic provenance must be inserted as `LEGACY_UNCLASSIFIED`,
marked quarantined and reviewed before classification. Ownership is not accepted from client
input and cannot be edited after creation. A correction requires a reviewed migration, not a UI
update.

## Document/RAG relationship

Document metadata, embedding jobs and chunks already use compound company ownership. TASK-012
does not change ranking or retrieval algorithms. Retrieval remains company-filtered; platform
articles are not silently inserted into tenant document vectors. Archived/quarantined/unpublished
articles are excluded before any future article indexing. Reindex jobs must copy ownership from
the source record, and ownership/visibility version changes must invalidate derived index state.

## Связанные документы

- [TASK-012](./tasks/TASK-012.md)
- [TASK-013](./tasks/TASK-013.md)
- [Knowledge publication runbook](./runbooks/knowledge-publication.md)
- [Architecture 2.0](./ARCHITECTURE_2_0.md)
- [Portal Architecture](./PORTAL_ARCHITECTURE.md)
- [ADR-0029](./DECISIONS.md#adr-0029)
