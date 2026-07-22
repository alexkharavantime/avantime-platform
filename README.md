# Avantime Platform v1.2

AI-first platform for 1C implementation, business automation, integrations, Agent+ and client support.

## Demo start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Client: `demo@avantime.lv` / `avantime`  
Administrator: `admin@avantime.lv` / `admin`

## PostgreSQL start

```bash
docker compose up -d postgres
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## Version 1.2

- company team management at `/portal/team`;
- request attachment UI and metadata API;
- Prisma `RequestAttachment` model and active user flag;
- administrator integration readiness page at `/admin/settings`;
- explicit object-storage boundary for production files.

The demo records attachment metadata only. Actual binary persistence requires S3-compatible storage and is intentionally not simulated as production-ready local storage.

## Quality

```bash
npm run db:generate
npm run typecheck
npm run lint
npm run build
```

Before production, set `SESSION_SECRET`, configure PostgreSQL and disable demo credentials.


## v1.2

- real attachment upload and download
- local file storage adapter
- password reset tokens and pages
- administrator system event journal


## v1.3
- email queue and templates
- Resend adapter with console fallback
- notification preferences
- admin email queue

## v1.4 — управляемая база знаний

- полнотекстовый поиск по заголовкам, описаниям, категориям и тегам;
- фильтрация по категориям;
- административное создание черновиков;
- публикация и архивирование материалов;
- PostgreSQL-модель `KnowledgeArticle` с демонстрационным fallback;
- автоматические рекомендации статей в карточке клиентского обращения.

После обновления схемы выполните:

```bash
npm run db:generate
npm run db:migrate
```

## macOS Big Sur

Для macOS Big Sur 11 используйте инструкции из [INSTALL_BIG_SUR.md](./INSTALL_BIG_SUR.md). В версии 1.5 закреплена совместимая версия `esbuild@0.26.0`.
