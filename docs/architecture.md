# Avantime Platform architecture — v0.6

## Applications

- `apps/web` — public website, AI consultant and client portal.

## Packages

- `packages/ui` — shared visual components.
- `packages/shared` — shared constants and utilities.
- `packages/database` — Prisma schema and lazy database client.

## Request storage

The portal uses a resilient repository layer:

1. When `DATABASE_URL` is configured and Prisma Client is generated, requests and messages are stored in PostgreSQL.
2. When PostgreSQL is unavailable, the application automatically uses the in-memory demo store.

This keeps development and demonstrations simple while preserving a production migration path.

## Jira adapter

The Jira adapter is isolated in `apps/web/lib/jira.ts`. It creates Jira Cloud issues only when all credentials are configured. Jira failures do not prevent a client request from being accepted by the portal.

## Next steps

- replace demo authentication with Auth.js;
- add file attachments;
- synchronize Jira comments and statuses;
- add administrative workspace;
- implement email notifications and audit log.
