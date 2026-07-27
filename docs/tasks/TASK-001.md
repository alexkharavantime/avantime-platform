# TASK-001. Первая реализация Avantime Platform v2 и страницы Agent+

## Статус

Done

## Ветка

`feature/avantime-platform-v2`

## Цель

Выполнить первую практическую итерацию разработки Avantime Platform v2, добавить страницу решения Agent+, подготовить правила работы Codex и исключить локальные runtime-данные и служебные файлы из Git.

## Выполненный объём

- Добавлена страница решения Agent+.
- Скорректирована форма входа клиентского портала.
- Добавлен корневой файл `AGENTS.md` с инструкциями для Codex.
- Добавлен документ `docs/CODEX_RULES.md`.
- Расширен `.gitignore` для локальных данных и служебных файлов.
- Изменения отправлены в ветку `feature/avantime-platform-v2`.

## Изменённые файлы

- `.gitignore`
- `AGENTS.md`
- `apps/web/app/solutions/agent-plus/page.tsx`
- `apps/web/components/portal/login-form.tsx`
- `docs/CODEX_RULES.md`

## Критерии приёмки

- [x] Страница Agent+ создана.
- [x] Страница соответствует общей структуре Avantime Platform.
- [x] Инструкции для Codex добавлены в репозиторий.
- [x] Локальные runtime-данные и служебные файлы добавлены в `.gitignore`.
- [x] Изменения зафиксированы в Git.
- [x] Рабочая ветка отправлена в GitHub.

## Результат выполнения

Задание выполнено. Ветка `feature/avantime-platform-v2` опережает `main` на два коммита.

Создана базовая структура страницы Agent+, добавлены правила работы Codex и исключения для локальных данных.

Статус `Done` относится только к объёму TASK-001 и не означает завершение всех работ Version 2.0.

## Известные ограничения

- Локальная модель документов пока не содержит полноценного tenant-контекста.
- Document API временно ограничен ролью `ADMIN`.
- Клиентский доступ к документам требует отдельной модели метаданных и RBAC.
- Необходимы дополнительные security-тесты для кодов 401, 403 и межкорпоративного доступа.

## Связанные документы

- [AGENTS.md](../../AGENTS.md)
- [Codex Rules](../CODEX_RULES.md)
- [Codex Workflow](../CODEX_WORKFLOW.md)
- [Vision](../VISION.md)
- [Master Specification](../MASTER_SPECIFICATION.md)
- [Roadmap](../ROADMAP.md)
- [Product Backlog](../PRODUCT_BACKLOG.md)
- [Project Status](../PROJECT_STATUS.md)
