# Локальная ручная проверка PDF

## Состояние этого запуска

Локальный сайт: <http://127.0.0.1:3000>. PostgreSQL и процессы document/embedding workers запущены; PDF не загружался, платные AI-запросы не выполнялись. Runtime был запущен с OpenAI embeddings/answers, PostgreSQL/pgvector, локальным хранилищем и очередями, без mock AI. Однако HTTP readiness сайта `/api/health/documents?mode=readiness` вернул `503 unavailable`. До выяснения расхождения между readiness приложения и CLI-проверкой не считайте реальный AI в веб-процессе подтверждённым и не загружайте PDF.

Проверка обычной локальной БД обнаружила блокер доступа: в ней нет организаций и активных членств; существующая учётная запись `ADMIN` не привязана к организации. Разделы `/ru/admin/documents` и `/ru/portal/knowledge` требуют организационный контекст и отправляют неавторизованного пользователя на вход. Селектор организации в интерфейсе отсутствует. Не создавайте тестовую организацию и не меняйте членство/роль в рамках этой проверки; сначала попросите владельца окружения предоставить существующей учётной записи доступ к нужной организации. Пока это не сделано, загрузить файл и проверить RAG через UI нельзя.

## Проверка после предоставления доступа

1. Откройте <http://127.0.0.1:3000/ru/portal/login?returnTo=%2Fru%2Fadmin%2Fdocuments> и войдите в существующую учётную запись кнопкой **«Войти»**.
2. Перейдите на <http://127.0.0.1:3000/ru/admin/documents>. Отдельного выбора организации нет: документ будет сохранён в организации, к которой привязана ваша сессия. Перед загрузкой убедитесь, что это нужная организация.
3. Подготовьте небольшой неконфиденциальный PDF с выделяемым текстом, например публичную инструкцию или памятку на 1–3 страницы. Максимальный размер файла — **20 MiB**. Сервер принимает PDF, PNG и JPEG, но для этой проверки используйте только текстовый PDF: OCR выключен, сканы могут не обработаться или потребовать ручной проверки.
4. Нажмите **«Загрузить документ»** и выберите PDF. Извлечённый текст и релевантные фрагменты документа будут передаваться внешнему AI-провайдеру OpenAI для embeddings и ответов. Не загружайте конфиденциальные или персональные данные.
5. В списке дождитесь статуса **«Обработан»**; рядом должно отображаться `index: completed`. Список сам не обновляется: обновите страницу браузера. Карточка документа показывает статус обработки, а вкладка **«Извлечённый текст»** позволяет проверить результат извлечения.
6. Откройте <http://127.0.0.1:3000/ru/portal/knowledge>. В блоке **«Задать вопрос базе знаний»** введите запрос и нажмите **«Получить ответ AI»**. Источники показываются под ответом; откройте ссылку источника, затем выберите указанную **«Страница N»** в PDF viewer. Ссылка открывает документ, но не прокручивает PDF автоматически к этой странице.

Примеры запросов:

1. «Кратко изложи содержание этого документа».
2. «Составь пошаговую инструкцию по описанному в документе процессу. Для шагов укажи источники и страницы. Недостающие сведения не придумывай».
3. «Какой срок указан в документе для [конкретного действия или этапа]?» Замените скобки фактом, который действительно есть в выбранном PDF.

## Ошибка и лимит AI

Если документ показывает **«Ошибка»** или **«Карантин»**, не загружайте дубликат. Проверьте, что оба worker-процесса работают, и попросите оператора посмотреть безопасные логи в `.data/manual-check/logs/`. Если embeddings или ответы AI недоступны либо превышен лимит, не повторяйте платный запрос: остановите проверку и свяжитесь с оператором. Диагностика без вызова моделей: `npm run documents:worker-check`, `npm run documents:health-check`, `npm run ai:budget-check` из корня репозитория с тем же runtime environment.

Для этого локального запуска общий PostgreSQL-backed предел ручной AI-сессии установлен переменной `BROWSER_REAL_AI_DIAGNOSTIC_MODE=1` и ограничивает сумму до **€0,05** между web и embedding worker. Обычные пределы заданы `AI_DAILY_BUDGET_EUR=0.20` и `AI_MONTHLY_BUDGET_EUR=0.20`; провайдер вызывается только после резервирования стоимости. Настройки применяются только к запущенным процессам, ключ OpenAI берётся из игнорируемого `.env` и не копируется в Git. Не включайте real-AI browser smoke: он создаёт тестовые данные и не нужен для ручной проверки.

## Перезапуск и остановка

Из PowerShell в корне `D:\avantime-platform` сначала запустите существующий PostgreSQL без удаления контейнера или volume:

```powershell
docker compose up -d postgres
$runtime = Join-Path $PWD '.data\manual-check'
$logs = Join-Path $runtime 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$env:DOCUMENT_STORAGE_DRIVER = 'local'
$env:DOCUMENT_METADATA_DRIVER = 'postgresql'
$env:DOCUMENT_PROCESSING_QUEUE_DRIVER = 'local'
$env:DOCUMENT_DATA_DIR = $runtime
$env:DOCUMENT_EMBEDDING_DRIVER = 'openai'
$env:DOCUMENT_EMBEDDING_MODEL = 'text-embedding-3-small'
$env:DOCUMENT_EMBEDDING_DIMENSIONS = '1536'
$env:DOCUMENT_VECTOR_DRIVER = 'pgvector'
$env:DOCUMENT_EMBEDDING_QUEUE_DRIVER = 'postgresql'
$env:RAG_ANSWER_DRIVER = 'openai'
$env:RAG_ANSWER_MODEL = 'gpt-5-mini'
$env:AI_DAILY_BUDGET_EUR = '0.20'
$env:AI_MONTHLY_BUDGET_EUR = '0.20'
$env:AI_PROVIDER_MAX_ATTEMPTS = '1'
$env:BROWSER_REAL_AI_KB_SMOKE = '1'
$env:BROWSER_REAL_AI_DIAGNOSTIC_MODE = '1'
$env:BROWSER_REAL_AI_DIAGNOSTICS_FILE = Join-Path $runtime 'ai-diagnostics.jsonl'
$env:DOCUMENT_RAG_REQUIRED_FOR_READINESS = 'true'
$env:DOCUMENT_WORKER_TENANT_ID = 'avantime'
$env:DOCUMENT_WORKER_ID = 'manual-check'
Start-Process npm.cmd -ArgumentList @('run','dev','-w','@avantime/web','--','--hostname','127.0.0.1','--port','3000') -WorkingDirectory $PWD -RedirectStandardOutput (Join-Path $logs 'web.log') -RedirectStandardError (Join-Path $logs 'web-error.log')
Start-Process node.exe -ArgumentList @('--env-file=.env','--import','tsx','apps/web/scripts/run-document-worker.ts') -WorkingDirectory $PWD -RedirectStandardOutput (Join-Path $logs 'document-worker.log') -RedirectStandardError (Join-Path $logs 'document-worker-error.log')
Start-Process node.exe -ArgumentList @('--env-file=.env','--import','tsx','apps/web/scripts/run-document-embedding-worker.ts') -WorkingDirectory $PWD -RedirectStandardOutput (Join-Path $logs 'embedding-worker.log') -RedirectStandardError (Join-Path $logs 'embedding-worker-error.log')
```

Для остановки только сайта и двух workers выполните:

```powershell
$webPid = (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess
$workerPids = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'run-document-worker\.ts|run-document-embedding-worker\.ts' } | Select-Object -ExpandProperty ProcessId
Stop-Process -Id (@($webPid) + @($workerPids))
```

Это не останавливает и не удаляет PostgreSQL, его volume, БД или `.data`. Не используйте `docker compose down --volumes`, reset, cleanup или seed.

## Связанные документы

- [AI Cost Control](./AI_COST_CONTROL.md)
- [AI Gateway](./AI_GATEWAY.md)
- [Document Operations](./DOCUMENT_OPERATIONS.md)
