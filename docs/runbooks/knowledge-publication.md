# Runbook: organization knowledge publication

## Prerequisites and actors

Use synthetic/non-confidential content. Ownership/company/classification must be reviewed and
immutable. Reviewer/publisher and distinct PUBLIC-visibility approver require their scoped
permissions and MFA/recent authentication.

## Procedure and expected output

Move DRAFT to REVIEW, verify reviewer-only access, create a
`KNOWLEDGE_VISIBILITY_PUBLIC` request bound to article/company/version, approve with a second actor,
execute PUBLIC once, then publish lifecycle status. Confirm the article stores approval ID, public
search/read behaves as expected, tenant-private content and RAG remain isolated, and citations
contain no confidential text. Archive and confirm removal from ordinary/public search and derived
index/cache invalidation in managed staging.

## Failure, rollback and escalation

Missing approval evidence is blocked by database constraint. Wrong tenant, version or replay is
denied. Return visibility to PRIVATE or archive via authorized action; never remove approval/audit
evidence. If index/cache still serves archived content, disable publication/indexing, terminate the
ceremony and follow incident response.

Evidence: ownership review, versions, approval/audit/notification IDs, sanitized search/citation
results and archive-negative result.
