# TASK-009 — Production identity, MFA and enterprise SSO foundation

**Статус:** In Progress  
**Рабочая ветка:** `feature/task-009-production-identity`  
**Дата начала:** 2026-07-30

> Историческая граница TASK-009: production callback и provider rollout были исключены из этой
> задачи. Их repository-level реализация продолжается в [TASK-010](./TASK-010.md); реальные IdP
> tenants по-прежнему требуют внешней validation ceremony.

## Цель

Создать production identity boundary для local credentials, MFA, account recovery, server-side
sessions и provider-neutral enterprise SSO foundation. Identity отделяется от tenant membership,
а существующие роли `CLIENT`/`ADMIN` и portal routes сохраняются.

## Gap analysis

| Область             | Найденный gap                                                               | Реализация TASK-009                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login/session       | Signed profile cookie, demo fallback при DB error, нет revoke/idle/MFA      | Opaque hashed PostgreSQL sessions, fail-closed production auth, idle/absolute expiry, rotation и revoke                                          |
| Password            | PBKDF2 в profile, слабая policy                                             | Source-scoped credential, versioned scrypt, successful-login rehash, 12–128 policy и bounded dummy KDF                                           |
| Reset               | Не было IP limit, notification и полного session revoke; test token был URL | Generic response, identifier+IP limits, hashed 30-minute one-time code, previous-code invalidation, POST body, full revoke, audit/notification   |
| Email verification  | Была только незавершённая модель                                            | Hashed one-time code, TTL, resend limits, generic response, safe redirect, verified state и rollout backfill                                     |
| MFA                 | Отсутствовала                                                               | AES-256-GCM TOTP, confirmation, replay counter, hashed one-time recovery codes, regeneration и tenant policy                                     |
| Provider model      | Минимальные OIDC/SAML rows                                                  | Entra/Google/generic OIDC profiles, issuer/client/secret reference/discovery/endpoints/JWKS/domains/mappings/metadata refresh                    |
| OIDC security       | Не было validator/mock flow                                                 | Code Flow, S256 PKCE, state/nonce, exact redirect, RS256/JWKS, issuer/audience/time/signature/replay/email verification и deterministic mock IdP |
| Linking             | Не было step-up и last-method protection                                    | Recent server reauthentication, validated assertion, no email-only linking, last-method unlink guard, audit/notification                         |
| Invitations         | Invite сразу создавал user/membership                                       | Tenant-bound 72-hour hashed one-time invitation, fixed CLIENT role, authenticated verified acceptance, revoke и audit                            |
| Brute force         | Login/reset/MFA не имели единого distributed boundary                       | Separate identifier/IP/MFA/reset/invitation scopes, bounded windows, fail-closed Redis production, threshold event/notification                  |
| Audit/notifications | Identity lifecycle был неполным                                             | Canonical allowlisted actions, generic tenant-aware events/notifications и strict metadata redaction                                             |
| Key management      | Нет version/rotation contract                                               | Versioned AES-GCM envelope, previous-key read contract, fail-closed production configuration and ceremony                                        |
| Migration           | Identity/profile/membership были смешаны                                    | Nullable-first/backfill, credential and membership split, email-verification backfill, preserved existing access, rehearsal                      |
| UI/tests/CI         | Только login/reset foundation                                               | Security settings, MFA/recovery/session/password/provider/policy UI, identity browser suite and dedicated CI/scans                               |

## Реализованный scope

### Password reset и email verification

- ответы не различают существующий и неизвестный identifier;
- 256-bit random codes, SHA-256 only at rest, 30-minute TTL, single-use и invalidation предыдущих;
- отдельные identifier/IP rate limits без раскрытия tenant membership;
- reset transaction меняет credential и отзывает остальные sessions;
- code передаётся только в POST body; open redirect проходит `safeReturnTo`;
- production delivery использует fail-closed `IDENTITY_EMAIL_DRIVER=resend`;
- test/dev не отправляют и не логируют реальные письма или codes;
- existing users получают `emailVerifiedAt` backfill, поэтому rollout не блокирует их;
- новые local/invited identities должны быть verified до соответствующего access transition.

### Enterprise SSO и linking

- `IdentityProvider` содержит provider-neutral OIDC boundary, Entra/Google/generic profile,
  secret-manager reference, domains и mapping foundation;
- OIDC transaction хранит hashed state/nonce, encrypted PKCE verifier, TTL и consumed marker;
- validator проверяет signature, key ID/rotation, alg allowlist, issuer, audience, `exp`/`nbf`,
  nonce, `email_verified`, token replay и exact redirect;
- deterministic mock IdP является единственным локально подтверждённым provider;
- linking требует recent reauthentication и validated provider assertion;
- совпадение email никогда не связывает identities;
- unlink требует step-up и запрещён для последнего login method;
- linking не создаёт tenant membership и не ослабляет MFA policy.

Полный authorization-code callback и реальные Entra/Google/generic tenants не подключены. Это
намеренно не объявляется production-ready SSO.

### Invitations, security events и privacy

- invitation не даёт доступ до authenticated acceptance verified identity;
- token hashed, one-time, tenant-bound, TTL 72 часа; client role жёстко `CLIENT`;
- acceptance/revoke atomic, повторное принятие безопасно отклоняется;
- canonical audit allowlist покрывает login/logout, password, MFA, recovery, sessions, external
  identity, policy и invitation lifecycle;
- generic security notifications покрывают обязательные high-risk события;
- metadata allowlist допускает только method, reason code и безопасный session ID.

Запрещены raw email/IP/user-agent/request body/claims/error, URL query, password, OTP, recovery
codes, cookies, Authorization, reset/verification/invitation tokens, TOTP secrets и provider
tokens.

## Migration strategy

Миграции `20260730120000_production_identity` и `20260730180000_identity_completion`:

1. добавляют nullable identity projection и нормализуют email;
2. копируют PBKDF2 hash в `UserCredential`, очищая legacy profile column;
3. backfill membership из существующего `User.companyId`;
4. backfill `emailVerifiedAt=createdAt` для existing users;
5. создают sessions, MFA, recovery, policy, provider/linking, OIDC transaction, verification,
   invitation и security-event tables;
6. только после backfill вводят source-specific uniqueness/foreign keys.

Case-insensitive duplicate local identifiers должны остановить migration для manual security
review; automatic merge/linking запрещены. Старые signed cookies нельзя безопасно конвертировать в
opaque DB sessions: после deploy требуется повторный login. Down migration не считается безопасным
rollback после переноса credential state; используются restore rehearsal и forward fix. Demo/test
fixtures создаются только guarded runners/seed и не являются production migration data.

## Production-like ceremony

Автоматизированный guard и безопасный evidence template описаны в
[Identity Production Ceremony](../IDENTITY_PRODUCTION_CEREMONY.md). Он проверяет environment,
secret-manager reference, key version, first ADMIN enrollment, ADMIN MFA enforcement, emergency
revoke drill, recovery drill и Security Owner approval, не выводя secret material.

Реальная ceremony локально не выполнялась и остаётся внешним go-live blocker.

## Критерии приёмки

- [x] Identity source uniqueness не основана на global email.
- [x] Membership отделён от identity и выводится только из server-side context.
- [x] Password hashing/policy/rehash и generic login errors реализованы.
- [x] Reset и verification codes hashed, short-lived, single-use и rate-limited.
- [x] TOTP/recovery/session lifecycle и tenant MFA policy реализованы.
- [x] Enterprise provider schema, validator, metadata refresh и deterministic mock IdP реализованы.
- [x] Email-only linking запрещён; step-up и last-method guard реализованы.
- [x] Invitation не выдаёт membership до verified authenticated acceptance.
- [x] Required audit actions, generic notifications и redaction реализованы.
- [x] Versioned authenticated encryption, rotation contract и production fail-fast реализованы.
- [x] Nullable-first migration/backfill и migration rehearsal реализованы.
- [x] Security settings UI и identity browser scenarios добавлены.
- [x] Identity-specific CI, credential/default/secret/client-tenant scans и docs link gate добавлены.
- [ ] Production-like staging ceremony выполнена владельцами.
- [ ] Реальные Entra, Google Workspace и generic OIDC tenants validated.
- [ ] Manual assistive-technology review выполнен.

## Проверки текущей итерации

Фактически выполнено:

- `npm run test` — 133/133 passed на полном checkpoint;
- `npm run test:identity` — 15/15 passed на отдельном checkpoint; после него в тот же файл добавлен
  один production-denial test browser-only response guard, покрытый последующим typecheck, но не
  повторным `test:identity`;
- `npm run typecheck` — 4/4 workspace tasks passed после последних code changes;
- `npm run lint` — 4/4 workspace tasks passed после последних code changes;
- `npm run build` — passed после последних code changes, 82 route/static entries;
- `npm run test:integration` — 19/19 passed, включая PostgreSQL identity lifecycle;
- `npm run documents:migration-rehearsal` — 8 migrations, empty/legacy/repeated deploy passed;
- Chromium identity lifecycle — 6/6 passed;
- `npm run test:accessibility` — 11/11 passed;
- route/link/tenant targeted Chromium suite — 27/28 passed; единственный failure был устаревшим
  first-page expectation после появления new-session security notifications. Assertion заменён на
  tenant-safe pagination, но финальный rerun заблокирован локальным approval/credits limit;
- identity, forbidden-credential, default-secret, client-tenant и secret scans — passed до
  последнего browser-only guard/test assertion delta;
- documentation link check — 14/14 documents passed до финальной статусной правки;
- scoped Prettier и `git diff --check` — passed после последних изменений.

Не выполнено/не подтверждено заново:

- финальный `npm run test`, `npm run test:identity`, static scans, documentation link check и
  targeted 4-test tenant rerun после последнего малого test/guard delta из-за локального
  approval/credits limit;
- реальная production-like ceremony и provider tenant validation;
- manual assistive-technology review.

OCR/RAG/container suites не входят в TASK-009 и в этой итерации не считаются повторно
подтверждёнными.

## Известные ограничения и статус

Repository-level реализация завершена, но один исправленный targeted browser assertion и
последующие `tsx` gates требуют повторного запуска. Environment acceptance дополнительно зависит
от production-like secret-manager ceremony, первого production ADMIN enrollment, emergency
revoke/recovery drills, Security Owner approval, реальных IdP tenant validations и manual
assistive-technology review.

По статусной политике проекта задача остаётся **In Progress**: кодовая готовность не равна
production validation.

## Связанные документы

- [Identity Architecture](../IDENTITY_ARCHITECTURE.md)
- [Identity Production Ceremony](../IDENTITY_PRODUCTION_CEREMONY.md)
- [Authentication](../authentication.md)
- [ADR-0026](../DECISIONS.md#adr-0026)
- [Security Hardening](../SECURITY_HARDENING.md)
- [Portal Architecture](../PORTAL_ARCHITECTURE.md)
- [Testing](../TESTING.md)
- [Browser Testing](../BROWSER_TESTING.md)
- [Project Status](../PROJECT_STATUS.md)
