# Jira webhooks

## Security contract

`JIRA_WEBHOOK_MODE` is `disabled`, `test` or `cloud` and defaults to `disabled`. Enabled modes
require a high-entropy server-only secret and one exact Jira tenant origin. Cloud mode accepts only
HTTPS `*.atlassian.net` origins. Browser bundles and public readiness never receive the secret.

TASK-017 uses Jira Cloud secure admin webhook HMAC: Jira computes the signature over the exact
UTF-8 request body and sends `X-Hub-Signature: sha256=<hex>`. Avantime validates the header with a
constant-time comparison before parsing or persistence. This is not a claim that actual tenant
delivery has been tested; registration and delivery remain `PENDING` until an approved test tenant
is available.

Authenticity is layered with exact origin allowlisting from `issue.self`, persisted issue ID/key
resolution, a bounded timestamp replay window, body-size cap, enabled-event allowlist, unique event
fingerprint and optional provider event ID. IP allowlisting may be added at the gateway but is not
treated as primary authenticity.

## Accepted events

- `jira:issue_updated` — explicit mapped status only;
- `jira:issue_deleted` — records a safe integration failure state, never deletes the local request;
- `comment_created` and `comment_updated` — strict explicitly public comments only.

Unsupported events return a safe ignored response. Unknown issue ID/key pairs are not persisted or
bound to a tenant. Webhook handlers never perform status/comment business processing inline.

## Stored data

`JiraInboundEvent` stores safe identifiers, fingerprint, tenant origin, persisted local tenant and
request IDs, timestamps, status/attempt/lease fields, normalized error and a versioned normalized
payload. Raw body, token, email, private comment content and provider user IDs are not retained. The
inbound worker periodically removes completed, ignored and dead-letter events older than the
configured retention period; the audit trail keeps the safe operational outcome.

## Comment policy

Inbound content requires explicit `jsdPublic=true`, `public=true`, or the approved
`sd.public.comment` property. Private and automation comments are stored only as `[withheld]` in the
normalized event and finish `IGNORED`. ADF is projected recursively to bounded plain text: links
lose URLs, mentions become `@participant`, unknown nodes/attachments are dropped, control
characters and excessive whitespace are removed. React renders text, never provider HTML.

## Связанные документы

- [TASK-017](./tasks/TASK-017.md)
- [Jira integration](./JIRA_INTEGRATION.md)
- [Jira webhook runbook](./runbooks/jira-webhooks.md)
- [Atlassian Jira Cloud webhooks](https://developer.atlassian.com/cloud/jira/platform/webhooks/)
