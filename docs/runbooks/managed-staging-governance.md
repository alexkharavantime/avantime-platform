# Managed staging governance runbook

## Prerequisites

- approved staging change, named operator and independent reviewer;
- synthetic users/tenant/article/recipient only;
- current commit/migration and external secret-store references;
- recent MFA for each acting person;
- evidence directory in the controlled store.

## Procedure

Run `governance preflight`; stop on any blocker. Verify the evidence SHA. Run one explicitly
approved ceremony with the same correlation ID. For bootstrap, reviewer verifies target before
execute and the owner performs a new login after old sessions are revoked. For support, terminate
and prove post-termination/expiry/role-removal denial. For approvals, prove self/replay/concurrency
and permission-removal denial. For knowledge, archive the synthetic article and validate every
cache/search/RAG negative observation. Validate terminal provider delivery receipts, then complete
the human accessibility checklist and create independent sign-off.

## Failure and rollback

Do not edit database rows or evidence. Bootstrap transaction failure leaves no assignment, ledger,
audit or notification. Terminate support, cancel/expire approval when allowed, archive/private the
synthetic article and preserve provider/reindex failures. Re-run with a new correlation/evidence
record only after root cause is fixed.

## Recovery drill

Recovery is staging-only policy validation. It requires exact target, external authority, two
different recent-MFA actors and a temporary expiry no more than one hour away. This repository does
not implement a grant executor or universal backdoor. Any real temporary grant must use the
externally approved platform role workflow, produce audit/notification evidence, receive post-review
and be revoked before the drill passes.

## Evidence

Retain canonical preflight/ceremony envelopes, audit IDs, provider IDs, hashed backend versions,
manual sanitized artifact references and independent sign-off. Never retain credentials, raw
notification payloads or tenant content.
