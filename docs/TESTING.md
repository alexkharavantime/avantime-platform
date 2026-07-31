# Testing

## Уровни проверок

Avantime Platform разделяет проверки по ответственности:

- `npm run test` — unit, security и contract tests без Docker и браузера;
- `npm run test:integration` — PostgreSQL/pgvector, MinIO и local queue;
- `npm run test:rag-integration` — реальный PostgreSQL/pgvector RAG boundary;
- `npm run test:production-integration` — Redis queue, cost ledger и audit;
- `npm run test:ocr-integration:docker` — реальный Tesseract/Poppler runtime;
- `npm run test:browser` — browser smoke, compatibility, tenant isolation, responsive и axe.

TASK-009 добавляет unit/security regressions для password KDF/policy, opaque sessions, TOTP,
recovery codes, CSRF, tenant-input rejection, MFA policy, rate limit, versioned key rotation,
invitation/email verification и OIDC validator с deterministic mock IdP. Обычный integration suite
дополнительно проверяет реальный PostgreSQL lifecycle: legacy PBKDF2 rehash, membership,
server-side session, TOTP/recovery, reset/verification single-use, invitation acceptance и OIDC
transaction replay. Migration rehearsal включает historical account baseline, verification
backfill и обе identity migrations.

TASK-010 расширяет identity suite полным deterministic Authorization Code callback: token exchange
с PKCE, server-side secret resolution, discovery/JWKS controls, durable token replay, Entra `tid`,
Google Workspace `hd`, organization SSO policy и tenant-isolated ADMIN provider lifecycle.
Deterministic mock evidence не означает validation реального provider tenant.

Identity-specific commands:

```bash
npm run test:identity
npm run identity:docs-check
npm run security:identity-scan
npm run security:forbidden-credential-scan
npm run security:default-secret-scan
npm run security:client-tenant-scan
```

Каждый integration/browser runner использует собственный guarded namespace или database.
Обычный unit suite не требует Docker, browser или внешней сети.

## Browser gate

TASK-008 использует один framework — Playwright — и обязательный Chromium project.
`@axe-core/playwright` проверяет WCAG A/AA, а `critical`/`serious` violations блокируют запуск.

```bash
npm run integration:up
npm run db:generate
npx playwright install chromium
npm run test:browser
```

Отдельные режимы:

```bash
npm run test:accessibility
npm run test:browser:headed
npm run test:browser:report
```

Browser test topology, fixtures, viewports, CI и artifact redaction описаны в
[Browser Testing](./BROWSER_TESTING.md). Автоматические axe checks не заменяют ручной
screen-reader и assistive-technology review.

## Общие правила

- Не использовать production credentials, domains или реальные providers в test environment.
- Не выставлять `TENANT_VALIDATED` для реального provider из deterministic fixture; test-only
  evidence reference должен быть явно помечен как mock/integration.
- Не принимать системную дату, произвольный sleep или external network за test oracle.
- Tenant context должен выводиться через тот же server-side boundary, что и в приложении.
- Failure artifacts не должны содержать cookies, authorization headers, credentials или bodies.
- Identity artifacts не должны содержать password/hash, TOTP secret/code, recovery/reset token
  или external provider claims.
- Browser/accessibility gate отмечается passed только после фактического запуска браузера.
- Scoped formatting применяется только к файлам текущей задачи; repository-wide formatting debt
  не исправляется попутно.
