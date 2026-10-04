# Production Readiness Checklist

Statuses are `Pending`, `Verified` or `Accepted risk`. Evidence must reference an
immutable CI artifact, release digest, runbook record or approved ticket.

| Area                             | Owner             | Status   | Blocking       | Evidence / verification                                                                                                                                                                             |
| -------------------------------- | ----------------- | -------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Infrastructure/network isolation | Platform          | Pending  | Yes            | Architecture review and private network test                                                                                                                                                        |
| DNS/TLS                          | Platform/Security | Pending  | Yes            | External TLS scan                                                                                                                                                                                   |
| Secrets and rotation             | Security          | Pending  | Yes            | `npm run production:config-check`                                                                                                                                                                   |
| PostgreSQL/pgvector              | DBA               | Pending  | Yes            | migrations, capacity and PITR evidence                                                                                                                                                              |
| Object storage                   | Platform          | Pending  | Yes            | private policy/versioning/backup evidence                                                                                                                                                           |
| Redis queue/rate limit           | Platform          | Pending  | Yes            | queue integration and TLS/auth check                                                                                                                                                                |
| Identity/MFA/session lifecycle   | Security          | Pending  | Yes            | TASK-009 migration, key rotation, admin enrollment and staging login/revoke smoke                                                                                                                   |
| Identity email delivery          | Platform/Security | Pending  | Yes            | DNS/Resend owner and access unknown; planned sender `noreply@avantime.lv`; verify domain, publish provider records, configure secrets outside Git, then send/receive a synthetic end-to-end message |
| Document workers/OCR             | Operations        | Pending  | Yes            | heartbeat and real OCR smoke                                                                                                                                                                        |
| Embedding workers                | Operations        | Pending  | Yes            | embedding/vector checks                                                                                                                                                                             |
| Knowledge index workers          | Operations        | Pending  | Yes            | article index heartbeat, lifecycle and retrieval smoke                                                                                                                                              |
| Notification workers             | Operations        | Pending  | Yes            | outbox heartbeat and approved-provider terminal receipt                                                                                                                                             |
| Jira outbound/inbound workers    | Operations        | Pending  | Yes            | both heartbeats, backlog/DLQ and approved test-project evidence                                                                                                                                     |
| AI providers                     | AI owner          | Pending  | Yes            | safe configuration/model/dimension check                                                                                                                                                            |
| Backups                          | DBA/Platform      | Pending  | Yes            | `npm run backup:dry-run`, freshness                                                                                                                                                                 |
| Restore/DR                       | Incident owner    | Pending  | Yes            | isolated rehearsal and signed record                                                                                                                                                                |
| Monitoring/traces                | SRE               | Pending  | Yes            | dashboards and collector smoke                                                                                                                                                                      |
| Alerts/on-call                   | SRE               | Pending  | Yes            | alert delivery test                                                                                                                                                                                 |
| Budgets/rate limits              | Product/Finance   | Pending  | Yes            | cost/budget report and policy approval                                                                                                                                                              |
| Security/dependencies            | Security          | Verified | No             | 2026-09-03 zero-finding npm audit and sequential fixable Critical/High image scans                                                                                                                  |
| Data protection/residency        | DPO/Security      | Pending  | Yes            | approved retention/residency review                                                                                                                                                                 |
| Incident response                | Incident owner    | Pending  | Yes            | tabletop exercise                                                                                                                                                                                   |
| Migration/rollback               | Release owner     | Pending  | Yes            | migration rehearsal and rollback drill                                                                                                                                                              |
| API/RAG smoke                    | QA                | Pending  | Yes            | health, retrieval, citation and no-leak tests                                                                                                                                                       |
| Initial SLOs                     | Product/SRE       | Pending  | No until pilot | measured staging report                                                                                                                                                                             |

## Go-live decision

Go-live is blocked while any blocking row is `Pending`. TASK-005 code/tests do not
replace environment-specific evidence, owner approval, production provider
validation or security acceptance.

## Dependency security status

The 2026-09-03 remediation supersedes the earlier temporary risk acceptances. The authoritative
`npm audit --omit=optional` reports zero vulnerabilities, the machine-readable acceptance file has
no active records, and sequential web/worker/migration/operations/OCR scans report no fixable
Critical/High findings. Details and retained historical context are in
[Dependency Security Review](./DEPENDENCY_SECURITY_REVIEW.md).

Any new dependency or OS-package finding reopens this row. Repository evidence does not replace an
SBOM and scan of the exact promoted release digest or approve production go-live.

## Repository quality remediation evidence

Targeted local/Docker validation on 2026-09-03 established the repository contracts required before
the next full release gate:

- repository-wide Prettier violations reduced from 35 files to zero;
- canonical local staging commands inject the real Git HEAD into matching Compose labels, runtime
  metadata and backup evidence; non-immutable staging/production evidence fails closed;
- containerized OCR passed 5/5 cases: PNG, scanned PDF, text-layer PDF bypass, controlled corrupt-PDF
  failure, timeout and temporary-file cleanup;
- pgvector exact passed Recall@K `1.0`, zero timeouts and zero tenant leakage; IVFFlat `0.1172` and
  HNSW `0.6448` remain `ANN NOT APPROVED / INFORMATIONAL`;
- the production Next.js build no longer infers its workspace root from an unrelated home-directory
  lockfile.

This is repository-level evidence only. It does not change any environment-specific `Pending` row,
approve managed staging, validate real providers or authorize production go-live.

## Local document/KB browser smoke (2026-10-02)

- A synthetic text-layer PDF was uploaded through the authenticated document UI; the API returned
  `202`, the document moved from `QUEUED` to `COMPLETED`, and its stored original matched the
  upload checksum.
- The standard document and embedding workers extracted the fixture text and wrote PostgreSQL/
  pgvector records. Hybrid retrieval, UI search, a generated answer, and its citation excerpt and
  `/portal/documents/{id}?chunk=...` link were verified; the tenant-A user could open and download
  the source.
- Tenant B received no result or document details; guest access was denied (`401`), and a viewer
  without upload permission was denied (`403`). A synthetic suspended membership was also denied
  document access and restored by test cleanup.
- Evidence: `apps/web/tests/browser/document-kb-smoke.spec.ts` passed 1/1 using an isolated local
  PostgreSQL/pgvector database, local file storage, the application PDF parser and worker scripts.
  Embeddings and answer generation used deterministic fakes; the fixture was text-layer only, so
  OCR and external AI providers were not exercised. `apps/web/tests/browser/access-requests.spec.ts`
  passed 6/6 on rerun; the earlier static-path/resend warning did not recur.
- Production build, web typecheck and scoped ESLint passed. The build reported two existing
  unused-variable warnings in portal SSO-policy and team-invite forms.
- Integration Compose validation remained blocked because the MinIO image pull was denied and the
  Redis pull was interrupted; no integration containers or volumes were created. This local smoke
  does not verify MinIO/S3, Redis, real OCR, managed workers or production providers. All related
  production/staging rows above remain `Pending`.

## PDF QA verification update (2026-10-03)

- The isolated browser smoke was rerun on a fresh loopback PostgreSQL database, unique local
  storage and deterministic test providers. An organization owner uploaded one synthetic,
  text-layer PDF from `/ru/admin/documents`; the document completed processing and showed the
  extracted retention fact and exact table rows: Hosting `2 x 12.50 EUR = 25.00 EUR`, Support
  `1 x 7.50 EUR = 7.50 EUR`, total `32.50 EUR`.
- The extracted text remained available after opening the document and reloading. Lexical search
  on `/ru/portal/knowledge` found the amount fragment; source navigation, download, citation
  excerpt/link and page 1 in the API and UI, guest denial, foreign-organization isolation and
  suspended-membership denial passed. The unique test database and storage were removed after the
  run; sanitized Playwright artifacts were kept.
- One authorized real-AI smoke was attempted. Both synthetic PDFs were uploaded; the first was
  text-extracted, then its `text-embedding-3-small` operation (1,536 dimensions) returned
  `QUARANTINED`, so no question/Responses calls, live citations, or real-provider ACL checks ran.
  Gateway and SDK retries were disabled for this run. The sanitized ledger contains one failed
  reservation estimated at EUR 0.00003 and no successful usage rows. A separate single diagnostic
  Embeddings request returned HTTP 429, `error.type=insufficient_quota`,
  `error.code=credit_balance_exhausted`; no embedding was returned. OpenAI reported exhausted
  project/account credit/quota at the time of that diagnostic, but the original worker response's
  exact HTTP status and charge are unavailable. No retry was made as part of that run. The unique
  database and storage were removed; sanitized Playwright artifacts remain under the run's
  `.artifacts` directory.
- One repeat real-AI smoke was run on 2026-10-04 after the balance top-up, using the existing key
  and the OpenAI `text-embedding-3-small` / `gpt-5-mini` models. Process-scoped driver/model
  settings selected those adapters; `.env` was not changed. Both synthetic PDFs were extracted
  and their document embeddings completed. The first question request returned HTTP 503 with the
  safe application code `AI_REQUEST_REJECTED`; no answer was produced, and the scenario stopped
  without retries or further questions. Citation assertions and cross-organization isolation were
  not reached. The run used configured EUR 0.25/day and EUR 1/month budget caps, 250 output-token
  and 3,000 context-character limits, and one attempt per provider operation. Two successful
  document embeddings are confirmed, but the exact provider-call total, token usage and estimated
  charge are unavailable: the partial ledger was in the unique database removed by runner cleanup.
  Twelve was the planned maximum, not a measured call count. The unique database and storage were
  removed; sanitized Playwright artifacts remain under
  `.artifacts/document-kb-real-ai-dc3a42480e6548b78d77d59bbd72e1ac`.
  Follow-up: diagnose the `AI_REQUEST_REJECTED` source and retain a sanitized aggregate ledger
  summary before the isolated database is removed on the next authorized run.
- The separate PDF functionality browser smoke used a deterministic fake answer only to exercise
  test plumbing; it is not evidence of real AI answer quality. The ignored repository-root `.env`
  contains an OpenAI key (presence checked only); persistent embedding/answer drivers remain `fake`
  and budgets remain zero. Non-test provider defaults fail closed; ordinary tests explicitly keep
  fake providers.
  Unit/security tests passed 224/224, web typecheck, scoped ESLint, Prettier and production build
  passed before the real-AI runs.
- Local OCR readiness is unavailable (`documents:ocr-check`); scanned PDFs have not been accepted
  as processed in this environment. Real OpenAI/Gemini answers, numeric reasoning, citation-page
  verification with a live model and provider-backed tenant isolation remain unverified. These
  results do not change production/staging `Pending` rows.

## Responses diagnostics follow-up (2026-10-04)

- The OpenAI gateway now retains bounded scalar diagnostics for HTTP failures (status, provider
  name/type/code and request ID), logs no message, headers or payload, and rejects Responses
  outcomes other than `completed`. Offline regression coverage verifies HTTP 503 metadata and an
  `incomplete` response; `tests/hybrid-rag.test.ts` passed 24/24. This does not identify the
  provider-side cause of the earlier HTTP 503 because no new provider call was made.
- The real-AI runner now writes a sanitized aggregate usage/reservation summary before temporary
  database cleanup, attempts artifact sanitization and resource cleanup independently, and carries
  forward the daily/monthly estimated budget and all-time 13-operation ceiling across fresh
  databases. Any prior real-AI artifact without a summary causes the next run to fail closed,
  regardless of age. The real-provider runner path has not yet been exercised with this update.
- Read-only local budget/cost commands completed against the root `.env` database and returned no
  policy rows and no retained usage rows. They cannot account for charges from already deleted
  temporary databases, so remaining provider spend is unverified. No additional external AI calls
  were made in this follow-up; the AI provider and API/RAG smoke rows remain `Pending`.

## Real-provider knowledge-base trial readiness (2026-10-02)

- Presence-only inspection of the local Next.js environment found `DATABASE_URL` and one
  non-empty `OPENAI_API_KEY`; no secret value was printed. Root `.env` provider drivers remain
  `fake`, so merely storing the key does not enable real AI. `GOOGLE_GENERATIVE_AI_API_KEY`,
  `REDIS_URL`, and model/dimension overrides remain absent.
  Non-test development defaults disable embedding and answer providers; test/browser suites select
  fakes explicitly. Local queues/storage, in-memory vectors and disabled OCR remain the defaults.
  The first real OpenAI smoke on 2026-10-03 ended in embedding quarantine before a RAG answer
  request; a separate one-call diagnostic returned 429 `insufficient_quota` /
  `credit_balance_exhausted`. After the balance top-up, one repeat smoke on 2026-10-04 completed
  both synthetic document embeddings, then its first question request returned HTTP 503
  `AI_REQUEST_REJECTED`. The raw provider error was not retained. The runner removed the unique
  database, so the repeat's exact call count, token usage and estimated charge cannot be recovered;
  no further retry is authorized by this run. Answer quality, citations and real-provider
  tenant isolation remain unverified.
- Supported adapters and code defaults are OpenAI `text-embedding-3-small` (1,536 dimensions) and
  Responses API `gpt-5-mini`, or Gemini `gemini-embedding-001` (configured output dimensionality
  defaults to 32) and `gemini-3.6-flash`. Google currently documents 3,072 as the embedding default
  and recommends 768, 1,536 or 3,072; the code's Gemini default of 32 has not been validated and
  should not be used for the pilot without a fresh-database compatibility/quality check. Google
  documents `gemini-3.6-flash` as Stable ([model list](https://ai.google.dev/gemini-api/docs/models));
  embedding sizes are documented [here](https://ai.google.dev/gemini-api/docs/embeddings).
  Gemini and the OpenAI Responses adapter remain unverified in a live call.
  Set `DOCUMENT_EMBEDDING_DRIVER`, `RAG_ANSWER_DRIVER` and the corresponding model settings;
  provide `OPENAI_API_KEY` and/or
  `GOOGLE_GENERATIVE_AI_API_KEY` through an approved local secret boundary. If positive cost limits
  are not set, the development memory controller treats zero as unlimited; authorize a finite
  `AI_DAILY_BUDGET_EUR` and `AI_MONTHLY_BUDGET_EUR` before any real calls.
- For this repository's browser smoke, put provider variables in the ignored repository-root
  `D:/avantime-platform/.env`, not only `apps/web/.env.local`: the dedicated runner loads the root
  file and explicitly passes the selected key to both its Next.js server and one-shot document
  workers. Do not commit `.env`. Example OpenAI configuration (replace the placeholder locally):

  ```dotenv
  DOCUMENT_EMBEDDING_DRIVER=openai
  DOCUMENT_EMBEDDING_MODEL=text-embedding-3-small
  DOCUMENT_EMBEDDING_DIMENSIONS=1536
  RAG_ANSWER_DRIVER=openai
  RAG_ANSWER_MODEL=gpt-5-mini
  OPENAI_API_KEY=<set-locally>
  ```

  Run only the opt-in scenario with `npm run test:browser:real-ai -w @avantime/web`. The runner
  rejects missing drivers/keys before creating test resources, uses a fresh loopback database and
  unique `.tmp` storage directory, then removes those exact database/storage resources. Sanitized
  Playwright diagnostics remain under that run's unique `.artifacts/document-kb-real-ai-<uuid>`.
  Ordinary browser tests explicitly strip inherited AI keys and continue to inject fakes. The mode
  uses a shared PostgreSQL EUR 0.25/day and EUR 1/month pre-call reservation cap, 250 output tokens
  and 3,000 context characters per answer, and per-request-type rate limits of 10/minute, 5/day,
  burst 3. It disables Playwright and provider retries. Exactly 12 operations are planned: two
  document embeddings plus one query embedding and one answer generation for each of five
  questions. Cross-tenant ACL checks use lexical search and direct document routes, so they do not
  issue additional provider requests. Estimated cost controls are not a provider invoice guarantee;
  use provider-side project quotas as an additional hard cap. Ordinary tests continue to inject
  fake providers.

- The existing pgvector column is unbounded `vector` with a database check that its vector length
  equals the row's `dimensions`; rows also store model and version. No dimension or model migration
  is indicated by this schema review, and no existing database/index was changed. A future isolated
  run should use a unique PostgreSQL/pgvector database, `DOCUMENT_VECTOR_DRIVER=pgvector`, a
  PostgreSQL embedding queue, local document storage and processing queue, and a unique storage
  directory. Redis and MinIO/S3 are not required for that local topology; managed production still
  requires its external queues, authenticated Redis and object storage. Text-layer PDF instructions
  do not need OCR; scanned PDFs and image uploads do.
- Document intelligence has generic document-type/extraction metadata, but no dedicated 1C
  configuration-name or configuration-version fields. Keep each 1C version in separate documents
  and include its exact configuration and version in the PDF title and body; cross-version
  applicability is not automatically enforced.
- Deferred reference set, not yet uploaded: two short, text-layer synthetic PDFs, each explicitly
  titled for fictional `1C:ERP 2.5.14`. The first states, “Nightly maintenance starts at 21:45.”
  The second states, “Backups are retained for 14 days.” Neither makes claims about another 1C
  version. Expected controls (not yet run):
  1. “Во сколько начинается ночное обслуживание в 1C:ERP 2.5.14?” Expected answer: `21:45`,
     citing the first PDF.
  2. “К какому времени запускают плановые работы в ERP 2.5.14?” Expected answer: `21:45`,
     citing the same passage despite the paraphrase.
  3. “Укажи время ночного обслуживания и срок хранения резервных копий.” Expected answer must
     include both `21:45` and `14 days`, with citations to both PDFs.
  4. “Какой PowerShell cmdlet выполняет обновление схемы?” Expected result: `no_answer`, no
     invented command or citation.
  5. “Подтверждают ли эти инструкции порядок для 1C:ERP 3.0?” Expected answer: applicability to
     3.0 is not established; cite only the version-scoped 2.5.14 documents if cited.
- For each control, record retrieval separately from generation: whether the expected passage
  appeared in top-K, whether the answer matches the oracle, whether each citation excerpt matches
  the source text, and whether the citation link opens for tenant A. Repeat tenant-B search, ask,
  and direct-source checks; assert tenant-A content/citations never reach a provider request for B.
  Keep the AI provider and API/RAG readiness rows above `Pending` until this bounded real-provider
  run and its cost evidence succeed.

## Smoke sequence

```bash
npm run production:config-check
npm run production:readiness
npm run queue:health-check
npm run workers:heartbeat-check
npm run ai:budget-check
npm run backup:status
```

`npm run staging:smoke:local` is local simulation evidence only. Managed staging starts with the
read-only `npm run staging:preflight:managed` contract and requires separately authorized provider
evidence; it cannot accept test Jira/notification or fake AI as success.

Perform one authorized document/OCR/embedding/RAG flow with non-sensitive staging
data, then verify citations, audit event, ledger entry and absence of content in
logs.

Identity staging evidence must separately confirm legacy credential migration,
admin TOTP enrollment before enforcement, recovery-code custody, password reset
delivery, session revoke/idle expiry and `MFA_ENCRYPTION_KEY` rotation procedure.
TASK-009 local tests do not mark this environment row `Verified`.

Identity email DNS and Resend validation is deferred until an authorized DNS/provider
operator and access are identified. Local and browser tests use suppressed delivery or
an injected fake transport; they do not verify DNS, provider acceptance, mailbox receipt
or end-to-end delivery. Resume this checklist row only after the sending domain is verified
in Resend, required DNS records are published, `RESEND_API_KEY` and `MAIL_FROM` are injected
through the approved secret boundary, and a synthetic message is sent and received. Provider
acceptance alone is not proof of mailbox delivery.

## Рекомендации по улучшению

- Replace role labels with named owners before staging approval.
- Store evidence outside the repository with retention and access control.
- Review checklist after every architecture or provider change.

## Связанные документы

- [Production Architecture](./PRODUCTION_ARCHITECTURE.md)
- [Production Deployment](./PRODUCTION_DEPLOYMENT.md)
- [Backup and Restore](./BACKUP_RESTORE.md)
- [Disaster Recovery](./DISASTER_RECOVERY.md)
- [Observability](./OBSERVABILITY.md)
- [Security Hardening](./SECURITY_HARDENING.md)
- [Dependency Security Review](./DEPENDENCY_SECURITY_REVIEW.md)
- [Authentication](./authentication.md)
- [TASK-005](./tasks/TASK-005.md)
- [TASK-009](./tasks/TASK-009.md)
