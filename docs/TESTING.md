# Testing

## Уровни проверок

Avantime Platform разделяет проверки по ответственности:

- `npm run test` — unit, security и contract tests без Docker и браузера;
- `npm run test:integration` — PostgreSQL/pgvector, MinIO и local queue;
- `npm run test:rag-integration` — реальный PostgreSQL/pgvector RAG boundary;
- `npm run test:production-integration` — Redis queue, cost ledger и audit;
- `npm run test:ocr-integration:docker` — реальный Tesseract/Poppler runtime;
- `npm run test:browser` — browser smoke, compatibility, tenant isolation, responsive и axe.

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
- Не принимать системную дату, произвольный sleep или external network за test oracle.
- Tenant context должен выводиться через тот же server-side boundary, что и в приложении.
- Failure artifacts не должны содержать cookies, authorization headers, credentials или bodies.
- Browser/accessibility gate отмечается passed только после фактического запуска браузера.
- Scoped formatting применяется только к файлам текущей задачи; repository-wide formatting debt
  не исправляется попутно.
