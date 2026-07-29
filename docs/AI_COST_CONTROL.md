# AI Cost Control

## Control flow

Every production embedding or answer request follows this order:

1. validate tenant/user/provider/model and correlation ID;
2. atomically consume Redis burst/minute/day limits;
3. reserve estimated EUR cost under a PostgreSQL advisory lock;
4. call the provider only after successful reservation;
5. reconcile tokens/embedding units and final cost;
6. release reservation on failure;
7. append one idempotent ledger event.

Development may use memory adapters. Production rejects memory rate limiting and
cannot call a provider without the PostgreSQL cost controller.

## Persistent data

`AiUsageLedger` is append-only by application contract and contains provider,
model, tenant, optional user, request type, correlation/idempotency keys, token or
embedding units, estimated/actual cost, EUR currency, status and timestamp. It
never stores prompts, answers, document text or embeddings.

`AiBudgetPolicy` defines daily/monthly limits, optional provider limits, warning
and hard-stop thresholds. `AiBudgetReservation` prevents concurrent overspend and
expires unreconciled reservations.

## Failure policy

- Redis rate limiter fails closed in production.
- Missing/invalid budget policy or failed reservation blocks the provider call.
- Budget exceeded returns a safe stable error code without disclosing internal
  keys or exact other-user activity.
- Reconciliation is idempotent by tenant/idempotency key.
- Provider cost remains estimated until invoices/usage exports are reconciled.

## Operations

```bash
npm run ai:cost-report -- --days=30
npm run ai:budget-check
```

The summary API `/api/admin/ai/usage` is `ADMIN`-only and tenant-derived
server-side.

Alerts:

- 80% daily/monthly budget: warning;
- hard-stop threshold: block and page the owner;
- reservation failure rate above baseline: investigate database/locking;
- actual/estimated cost drift above 20%: recalibrate price table;
- unexpected provider/model usage: security review.

## Рекомендации по улучшению

- Import provider invoices into a separate reconciliation workflow.
- Add approved per-tenant override UI with persistent audit.
- Measure real token/cost distributions before changing defaults.

## Связанные документы

- [AI Gateway](./AI_GATEWAY.md)
- [Observability](./OBSERVABILITY.md)
- [Security Hardening](./SECURITY_HARDENING.md)
- [TASK-005](./tasks/TASK-005.md)
