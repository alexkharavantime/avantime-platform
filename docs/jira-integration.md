# Jira integration preparation

The portal now has a stable request model and API routes. The next implementation step is to replace the in-memory store with Prisma/PostgreSQL and add a Jira adapter.

## Planned request flow

1. Client creates a request in `/portal/requests/new`.
2. The application validates and saves it in PostgreSQL.
3. A background integration creates a Jira issue.
4. `jiraKey` is saved on the support request.
5. Jira status and comments are synchronized back to the portal.

## Environment variables

Use `.env.example` as the starting point. Never commit real Jira credentials.
