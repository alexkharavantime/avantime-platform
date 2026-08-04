# Jira integration

## Boundary

TASK-016 implements outbound issue creation. TASK-017 adds repository-level inbound status/public
comment synchronization and asynchronous customer comments. Avantime remains the customer-facing
system; Jira becomes the status source after successful issue creation. A Jira outage never rolls
back or hides the local request. Attachments remain outside this boundary.

## Request and queue sequence

1. The API validates same-origin, session, organization permission and plain-text payload.
2. The server resolves the organization mapping; the client never supplies Jira project fields.
3. One PostgreSQL transaction creates the local request, optional `JiraOperation`, and audit rows.
4. The Jira worker claims eligible operations with database time and `FOR UPDATE SKIP LOCKED`.
5. The provider receives a bounded safe projection, not raw client JSON or server credentials.
6. Terminal success stores issue ID/key/HTTPS URL and enqueues portal/notification-outbox events.
7. Transient errors use bounded exponential retry; permanent/exhausted errors enter DLQ.

## Configuration

`JIRA_MODE` is `disabled`, `test`, or `cloud`; `JIRA_INTEGRATION_ENABLED` must agree with the mode.
Disabled is the default. Cloud mode requires a public HTTPS base URL, service-account identifier,
API token, project key and issue type. Placeholder, local/private URL and URL credential values are
rejected. Test mode is deterministic, performs no network calls, and rejects cloud credentials.
Configuration summaries, logs, audit and browser responses never include the token.

`.env.staging.example` is placeholders only. Actual credentials must be injected from the approved
secret store and must not be committed.

## Organization mapping

`JiraOrganizationMapping` is tenant-owned and versioned. It contains project key, optional issue
type/component/request type and enabled state. Resolution always uses the server-derived
`companyId`; a disabled or missing mapping yields `NOT_CONFIGURED` without losing the request.

## Idempotency and recovery

The submit key is unique per local request, and the operation has a separate unique stable key.
Only one operation may exist for a request. Conditional terminal updates prevent a stale worker
from overwriting completion. The cloud payload includes a hashed Avantime marker, and retry first
reconciles that marker through Jira search before creating an issue. This closes the ambiguous
provider-success/client-timeout window where Jira search permissions support reconciliation.

Worker leases use PostgreSQL-authoritative time. Expired leases are reclaimable; processing is
concurrency-safe, retries are bounded, and terminal failures remain inspectable in DLQ.

## Status and comments

Secure webhooks persist a separate normalized `JiraInboundEvent` and return before business
processing. The inbound worker resolves tenant only through the persisted Jira issue ID/key pair,
uses organization-specific/default status allowlists and fences older `jiraUpdatedAt` values.
Resolved/closed requests do not silently roll back to a non-terminal status.

Inbound Jira comments require an explicit JSM public marker and a non-automation author. ADF is
projected to safe bounded text; URLs, provider IDs, email, HTML and attachments are excluded.
Private content is replaced with `[withheld]` before persistence.

Customer comments are committed locally with an `ADD_COMMENT` operation in one transaction. The
same Jira worker sends a safe public JSM comment, reconciles a visible hashed Avantime reference,
and updates delivery state to `SENT`, `FAILED` or `DEAD_LETTER` without blocking HTTP.

## Safe payload

The projection normalizes plain text, strips control characters, caps summary/description length,
maps only allowlisted priority/category values and adds hashed request/idempotency references.
Credentials, raw claims, permissions, internal mappings, arbitrary client JSON and unnecessary
personal data are excluded.

## Validation status

- deterministic test adapter: validated by unit, integration, browser and local staging smoke;
- Jira Cloud adapter: implemented against REST API v3 with normalized errors and timeout;
- real Jira Cloud connectivity and issue creation: `PENDING` because no credentials or authorized
  environment were provided.
- secure-admin-webhook HMAC contract: covered by Atlassian test vector and local adapters;
- actual Jira Cloud webhook registration/delivery and JSM public-comment permissions: `PENDING`.

## Связанные документы

- [TASK-016](./tasks/TASK-016.md)
- [Jira worker runbook](./runbooks/jira-worker.md)
- [Jira webhooks](./JIRA_WEBHOOKS.md)
- [TASK-017](./tasks/TASK-017.md)
- [Staging deployment](./STAGING_DEPLOYMENT.md)
- [Architecture 2.0](./ARCHITECTURE_2_0.md)
- [ADR](./DECISIONS.md)
