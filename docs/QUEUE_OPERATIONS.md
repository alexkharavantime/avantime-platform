# Queue Operations

## Queue model

Production uses Redis-backed document and embedding queues. Local adapters remain
development/test-only. Jobs contain tenant/document/job identifiers, version,
correlation ID, attempts and timing metadata; content and secrets are forbidden.

Redis uses atomic Lua operations and server time for:

- idempotent enqueue;
- delayed availability and retry;
- exclusive claim and visibility lease;
- monotonically increasing fencing token;
- heartbeat/lease renewal;
- fenced acknowledge/release;
- recovery of expired leases.

Quarantine remains reflected in PostgreSQL lifecycle metadata. Redis is a
coordination layer, not the durable source of document state.

## Worker rules

- A worker stops claiming before graceful shutdown.
- Long OCR/embedding operations renew the lease.
- Every critical metadata/completion update asserts worker identity and fence.
- A worker that lost the lease must abandon completion.
- Duplicate delivery is safe because enqueue and terminal lifecycle are idempotent.
- Deployment generation and worker version are recorded for diagnosis.

## Commands

```bash
npm run queue:health-check
npm run workers:heartbeat-check
npm run documents:health-check
npm run documents:embedding-check
```

The commands emit structured safe output and return non-zero when required
production state is unavailable.

## Incident procedures

### Queue age or depth grows

1. Check worker heartbeat, retry/quarantine counts and downstream dependencies.
2. Stop rollout if the issue started with a new generation.
3. Scale workers only after PostgreSQL/S3/provider capacity is confirmed.
4. Do not manually delete Redis keys.
5. Verify terminal metadata and queue depth after recovery.

### Worker crash

Wait for lease expiry or restart a healthy generation. The next claim receives a
higher fence; stale completion is rejected.

### Redis loss

Contain enqueue traffic, restore Redis according to provider procedure, then
reconcile PostgreSQL documents/jobs that are non-terminal but absent from Redis.
Never infer completed processing from Redis alone.

### Quarantine

Investigate the safe error code. Retry only a single reviewed document through the
existing ADMIN-only flow. Bulk destructive retry is intentionally absent.

## Alerts

- queue age above 5 minutes: warning; above 15 minutes: critical;
- no healthy worker heartbeat for two lease intervals: critical;
- quarantine growth above baseline: warning;
- repeated stale-fence rejection: investigate clock/configuration/deployment;
- Redis authentication/TLS failure: critical, fail closed.

## Рекомендации по улучшению

- Add reconciliation tooling that compares Redis queues with PostgreSQL lifecycle.
- Establish tenant-specific capacity only after measured load and fairness review.

## Связанные документы

- [Production Architecture](./PRODUCTION_ARCHITECTURE.md)
- [Observability](./OBSERVABILITY.md)
- [Disaster Recovery](./DISASTER_RECOVERY.md)
- [Document Processing](./DOCUMENT_PROCESSING.md)
- [TASK-005](./tasks/TASK-005.md)
