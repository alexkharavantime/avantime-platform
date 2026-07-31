# Browser smoke и accessibility automation

TASK-008 добавляет воспроизводимый Chromium gate для канонического `/portal`, compatibility
маршрутов `/dashboard/**`, tenant isolation, keyboard interaction и автоматической проверки
WCAG A/AA.

## Граница окружения

Browser suite не использует development `.env.local`, demo auth или production данные.
Подготовка разрешена только для loopback PostgreSQL и точного имени базы
`avantime_browser_integration`. Перед каждым запуском база пересоздаётся, к ней применяются
`prisma migrate deploy` и текущая Prisma schema, после чего загружаются фиксированные fixtures:

- `browser-tenant-a` и `browser-tenant-b`;
- по одному пользователю роли `CLIENT` для каждого tenant;
- отдельный пользователь `ADMIN`;
- обращения, уведомления, статья и документы обоих tenants.

Термин `USER` в browser-сценариях соответствует существующей роли `CLIENT`. TASK-008 не меняет
RBAC. Авторизация выполняется через обычную `/portal/login`; cookies или storage state напрямую
не внедряются. TASK-009 хранит fixture password в `UserCredential`; первый login проверяет
совместимый PBKDF2 rehash и создаёт opaque PostgreSQL session.

Значение по умолчанию:

```text
postgresql://avantime_test:avantime_test_only@127.0.0.1:55432/avantime_browser_integration
```

Для CI допустимо задать `BROWSER_DATABASE_URL`, но guard по loopback host и точному имени базы
сохраняется.

## Запуск

Сначала должен быть доступен PostgreSQL/pgvector integration service:

```bash
cp .env.integration.example .env.integration
npm run integration:up
npm run db:generate
npx playwright install chromium
npm run test:browser
```

Дополнительные команды:

```bash
npm run browser:prepare
npm run test:accessibility
npm run test:browser:headed
npm run test:browser:report
```

На macOS 11 Playwright 1.62 больше не загружает bundled Chromium. Конфигурация использует
установленный Google Chrome как Chromium-compatible executable только на этой legacy host
версии. В Linux CI устанавливается точная bundled Chromium revision командой Playwright.

## Покрытие

Desktop smoke проверяет:

- client и admin login через production-like DB auth;
- основные `/portal` страницы, документы и обращения;
- `/portal/settings/security` и минимизированный список server-side sessions;
- запрет client-доступа к `/admin`;
- compatibility redirects, query parameters, deep links и безопасный 404;
- прямые cross-tenant request/document URLs;
- tenant-scoped lists, notifications и отклонение client `companyId`.

TASK-009 identity suite дополнительно проверяет safe primary-login errors, TOTP enrollment and
challenge, invalid/replayed OTP, recovery-code use/reuse denial, password change, reset code only
in POST body, session listing/revocation, ADMIN policy, CLIENT denial, open-redirect denial and
email-only linking denial. Test-only codes come from guarded responses/session storage and never
become URL parameters.

Responsive проекты используют фиксированные viewport: desktop `1440x900`, tablet `834x1112`
и mobile `390x844`. Проверяются horizontal overflow, desktop/mobile navigation, dialog
semantics, keyboard focus containment, `Escape` и возврат фокуса.

Accessibility suite использует `@axe-core/playwright` с тегами WCAG 2.0/2.1/2.2 A/AA.
`critical` и `serious` violations блокируют gate. Blanket exclusions и отключение правил не
используются. Дополнительно проверяются landmarks, один основной `h1`, доступные имена controls,
image alternatives, table headers и keyboard focus.

Автоматическая axe-проверка не заменяет ручной аудит screen reader, zoom/reflow, цветовых
состояний и cognitive accessibility. Ручной review отмечается passed только после отдельного
фактического выполнения.

## Диагностика и чувствительные данные

При failure Playwright сохраняет screenshot, HTML report, axe JSON, error context и trace в
`.artifacts/`. Каталог игнорируется Git. Trace после запуска перепаковывается с redaction для
authorization/cookie/password/secret/token полей и фиксированных тестовых credentials.
Browser diagnostics сохраняет только тип события, безопасное сообщение, HTTP method, pathname
без query и status. Request/response bodies и headers не записываются.

`net::ERR_ABORTED` не считается сетевым сбоем только для намеренно заменённой top-level
navigation или Next.js App Router transition с точным `RSC: 1` header. Aborted API и прочие
resources, page errors, console errors и same-origin HTTP 5xx остаются blocking.

## CI

Job `browser-accessibility`:

- отделён от document/OCR integration;
- зависит от успешного `quality`;
- запускает собственный PostgreSQL/pgvector service;
- устанавливает Chromium;
- выполняет полный `npm run test:browser`;
- загружает failure artifacts с retention 14 дней;
- является blocking check.

Никакие внешние AI, Jira, email, object storage или OCR providers browser suite не вызывает.
Реальный screen-reader/assistive-technology review остаётся manual external gate и не выводится из
успеха axe.
