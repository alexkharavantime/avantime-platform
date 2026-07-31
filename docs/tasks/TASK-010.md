# TASK-010 — Production OIDC rollout and identity validation

**Статус:** In Progress  
**Рабочая ветка:** `feature/task-010-oidc-production-rollout`  
**Дата начала:** 2026-07-31

## Цель и границы

TASK-010 завершает repository-level Authorization Code Flow для Microsoft Entra ID, Google
Workspace OIDC и generic enterprise OIDC. Реальные credentials не хранятся в Git. Ни один реальный
provider не считается validated, пока контролируемое подключение к его tenant не выполнено и
evidence не принято владельцами.

TASK-006 и container supply-chain scope не входят в эту задачу.

## Gap matrix TASK-009 foundation

| Requirement              | Current implementation после аудита                                                | Production-ready                                                               | Missing / external dependency                                      | Risk                                       | Required tests                                                |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------- |
| Authorization Code Flow  | TASK-009 имела request builder, state, nonce и PKCE, но не callback/token exchange | Да, на repository level                                                        | Реальный IdP tenant                                                | Подмена code/redirect                      | Deterministic full callback, exact redirect, PKCE form        |
| Discovery и JWKS         | Validator существовал; metadata передавалась вызывающим кодом                      | Да, после server-side fetch, issuer match, size/timeout/redirect/host controls | Production egress allowlist и реальный endpoint                    | SSRF, issuer/key substitution              | Discovery mismatch, JWKS/signature/key tests                  |
| State/nonce/replay       | Hashed state/nonce, encrypted PKCE и consumed state существовали                   | Да                                                                             | Cleanup expired rows operationally                                 | Callback/token replay                      | State replay и durable token replay                           |
| Provider configuration   | TASK-009 model была provider-neutral, но без lifecycle/version/evidence            | Да, repository level                                                           | Environment-specific secret resolver/tenant validation             | Stale или cross-tenant config              | ADMIN, tenant isolation, version conflict, enable fail-closed |
| Secret boundary          | Reference была plaintext-compatible model field                                    | Да, reference encrypted; secret value server-side only                         | Secret injection ceremony                                          | Credential disclosure/unavailable callback | Safe projection и resolver fail-closed                        |
| Tenant mapping           | Domains/JSON foundation без provider-specific enforcement                          | Да                                                                             | Реальные Entra `tid` / Google `hd` значения                        | Email-domain tenant confusion              | Entra `tid`, Google `hd`, unknown tenant denial               |
| Linking                  | Recent reauthentication и no-email-only linking существовали                       | Да                                                                             | Provider account must already be controlled                        | Account takeover                           | Explicit link mode, session/company match, subject uniqueness |
| Membership               | Уже была отделена от identity                                                      | Да                                                                             | Pre-provisioning/invitation remains required                       | JIT privilege escalation                   | Unknown subject cannot create user/membership                 |
| Organization SSO         | Только MFA policy                                                                  | Да, repository level                                                           | Staged owner-approved enforcement                                  | Organization lockout                       | Optional/required/local-login/provider selection              |
| Disable/session policy   | Новые logins блокировались неявно, session policy отсутствовала                    | Да                                                                             | Operator chooses preserve/revoke                                   | Stale access                               | Enable prerequisites and revoke-on-disable                    |
| Audit/notifications      | Identity allowlist существовал                                                     | Да                                                                             | Production sink availability remains separate gate                 | Sensitive claims/errors in telemetry       | Action/metadata allowlist and safe targets                    |
| ADMIN UI/API             | Provider read-only overview                                                        | Да, repository level                                                           | Browser review in deployed staging                                 | Cross-tenant administration                | Server session tenant, client tenant ID rejection             |
| Real provider validation | Не выполнялась                                                                     | Нет                                                                            | Entra, Google и generic tenant owners, credentials, rollout window | False production claim                     | Evidence ceremony per provider                                |

## Реализованный repository scope

- tenant-bound `IdentityProvider` lifecycle с profile, display name, issuer, discovery URL, client
  ID, encrypted write-only secret reference, redirect allowlist, domains, claim/group mapping,
  default role `CLIENT`, enable state, metadata timestamps, validation/evidence status, key/config
  versions и explicit session policy;
- issuer меняется только через controlled revalidation; любое configuration update сбрасывает
  metadata/evidence, отключает provider и увеличивает optimistic version;
- legacy OIDC без trusted `companyId` не привязывается автоматически: migration сохраняет запись,
  но переводит её в quarantined `REVALIDATION_REQUIRED`/disabled state;
- полный callback: code exchange, PKCE verifier, exact redirect, ID-token validation, server-side
  JWKS, durable token replay reservation и opaque provider-linked session;
- отдельный ADMIN/MFA/recent-auth `PROVIDER_VALIDATION` callback разрывает bootstrap cycle:
  disabled metadata-validated provider может выполнить реальное tenant handshake, но не создаёт
  login session; только успешные protocol и mapping checks записывают `TENANT_VALIDATED`;
- Entra mapping требует allowlisted tenant claim, Google Workspace — allowlisted `hd`; email domain
  сам по себе не связывает Google tenant;
- automatic email linking и JIT membership запрещены; login разрешён только предварительно
  linked identity с активной membership;
- identity linking является отдельным `mode=link`, требует текущую server-side session и recent
  authentication и не выбирается лишь из-за наличия cookie;
- organization SSO policy поддерживает disabled/optional/required, staged enforcement, grace
  period и explicit local-login policy;
- ADMIN-only UI:
  - `/portal/settings/security/identity-providers`;
  - `/portal/settings/security/identity-providers/new`;
  - `/portal/settings/security/identity-providers/[id]`;
- provider create/update/metadata/status и SSO policy API получают tenant только из validated
  server session; client `companyId`/`tenantId`/`organizationId` отклоняются;
- security events/audit содержат только allowlisted action, result, correlation ID, safe provider
  ID, configuration version, validation status и reason code. Authorization codes, tokens,
  claims, email, secret references/values и raw errors не записываются.

## Validation states

| State                   | Meaning                                                    | Login              |
| ----------------------- | ---------------------------------------------------------- | ------------------ |
| `NOT_VALIDATED`         | Конфигурация сохранена, metadata/tenant не проверены       | Blocked            |
| `METADATA_VALIDATED`    | Discovery issuer/endpoints подтверждены server-side        | Blocked            |
| `TENANT_VALIDATED`      | Реальное tenant connection выполнено и evidence принято    | Может быть enabled |
| `REVALIDATION_REQUIRED` | Issuer/critical config изменены или legacy row quarantined | Blocked            |
| `FAILED`                | Validation ceremony не пройдена                            | Blocked            |

Metadata-only validation никогда не переводит provider в `TENANT_VALIDATED`. UI запускает
server-controlled validation callback, но не содержит кнопки самодекларации результата.

## Тестовое evidence

- dedicated identity suite: deterministic signature/issuer/audience/nonce/time, PKCE code exchange,
  discovery mismatch, production host allowlist, Entra `tid`, Google `hd`, client tenant input и
  organization SSO policy;
- PostgreSQL integration: full deterministic callback, encrypted secret reference, prelinked
  identity, provider-linked session result, tenant-isolated ADMIN lifecycle, issuer revalidation и
  fail-closed enable;
- migration deploy: legacy baseline → all identity migrations, включая quarantine legacy OIDC.

Deterministic mock IdP является только test evidence. Он не подтверждает Microsoft Entra ID,
Google Workspace или generic production tenant.

## Локальные gate-результаты 2026-07-31

| Gate                                  | Фактический результат                                      |
| ------------------------------------- | ---------------------------------------------------------- |
| `npm run test -- --force`             | passed, 138/138                                            |
| `npm run test:identity`               | passed, 21/21                                              |
| `npm run test:integration`            | passed, 20/20                                              |
| `npm run test:production-integration` | passed, 1/1                                                |
| `npm run test:rag-integration`        | passed, 1/1                                                |
| migration rehearsal                   | passed, empty/legacy upgrade и repeated deploy             |
| `npm run typecheck -- --force`        | passed, 4/4 workspaces без cache                           |
| `npm run lint`                        | passed; web ESLint, остальные workspace placeholders       |
| `npm run build`                       | passed с CI test-only environment                          |
| `npm run test:browser`                | passed, 54/54 desktop/tablet/mobile/accessibility сценария |
| identity/security scans               | passed, findings отсутствуют во всех пяти режимах          |
| identity documentation check          | passed, 14 документов                                      |

Первый migration rehearsal после добавления TASK-010 корректно применил все migration, но его
harness всё ещё ожидал восемь platform migrations. Invariant обновлён до фактических девяти, после
чего empty/legacy rehearsal и repeated deploy прошли. Первый локальный build без environment
ожидаемо остановился на production fail-fast `SESSION_SECRET`; повторный build с тем же публичным
test-only environment, который задан в CI, прошёл.

## Acceptance checklist

- [x] TASK-009 foundation и gaps зафиксированы.
- [x] Authorization Code Flow, callback, state/nonce/PKCE и durable replay реализованы.
- [x] Provider configuration tenant-bound, versioned и secret-safe.
- [x] Issuer change/disable/session policies explicit и fail-closed.
- [x] Controlled tenant mapping и no-email-only linking реализованы.
- [x] Organization SSO policy реализована.
- [x] ADMIN-only provider UI/API реализованы.
- [x] Deterministic unit/integration validation добавлена.
- [x] Rollout runbook и evidence template добавлены.
- [x] Локальные unit/typecheck/lint/build/browser/security/documentation gates пройдены.
- [ ] Microsoft Entra ID tenant фактически validated.
- [ ] Google Workspace tenant фактически validated.
- [ ] Generic enterprise OIDC tenant фактически validated.
- [ ] Staging rollout и rollback drill выполнены владельцами.
- [ ] Security Owner принял provider evidence.

## Текущий статус

Repository-level реализация и локальные gates пройдены. TASK-010 остаётся **In Progress**, поскольку
реальные provider tenants, staging rollout/rollback drill и Security Owner acceptance являются
внешними blocking gates. Ни один реальный provider не объявлен validated.

## Связанные документы

- [OIDC Production Rollout](../OIDC_PRODUCTION_ROLLOUT.md)
- [OIDC Provider Validation Evidence](../OIDC_PROVIDER_VALIDATION_EVIDENCE.md)
- [Identity Architecture](../IDENTITY_ARCHITECTURE.md)
- [Identity Production Ceremony](../IDENTITY_PRODUCTION_CEREMONY.md)
- [Authentication](../authentication.md)
- [Security Hardening](../SECURITY_HARDENING.md)
- [TASK-009](./TASK-009.md)
