# Document Intelligence и OCR

## Назначение

Завершённая TASK-003 расширяет tenant-aware worker TASK-002. Порядок обработки:

1. claim job в server-controlled tenant;
2. чтение оригинала с checksum verification;
3. определение фактического MIME по сигнатуре;
4. обычное извлечение текста из PDF;
5. централизованная оценка качества;
6. OCR только для изображения либо недостаточного PDF-текста;
7. нормализация, rule-based type detection и chunking;
8. сохранение производных и intelligence metadata;
9. переход в `COMPLETED` и ACK.

OCR не вызывается для качественного текстового PDF. Ошибка OCR использует существующие retry/quarantine правила, а partial derivatives удаляются.

## Поддерживаемые форматы

| Формат    | Определение        | Обработка                    |
| --------- | ------------------ | ---------------------------- |
| PDF       | `%PDF-`            | PDF text, затем OCR fallback |
| PNG       | PNG signature      | OCR                          |
| JPEG      | JPEG SOI signature | OCR                          |
| DOCX/XLSX | ZIP + extension    | controlled unsupported error |
| прочее    | unknown            | controlled unsupported error |

Расширение и клиентский MIME не являются источником доверия. Несовпадение помечает документ для manual review.

## Локальный OCR runtime

Adapter запускает Tesseract через `spawn` с `shell: false`. Для PDF требуются `pdfinfo` и `pdftoppm` из Poppler.

macOS:

```bash
brew install tesseract tesseract-lang poppler
tesseract --list-langs
npm run documents:ocr-check
```

Изолированная Docker-проверка с `eng`, `rus`, `lav` и Poppler:

```bash
npm run test:ocr-integration:docker
```

Нужные language packs задаются allowlist `eng,rus,lav` (`lav` — код Latvian в Tesseract). Конкретная установка должна содержать все выбранные языки. Бинарные файлы и trained data не хранятся в репозитории.

## Конфигурация

| Переменная                             | Назначение                                                        |
| -------------------------------------- | ----------------------------------------------------------------- |
| `DOCUMENT_OCR_DRIVER`                  | `local` или `disabled`; production требует явный рабочий provider |
| `DOCUMENT_OCR_REQUIRED_FOR_READINESS`  | включает OCR в overall readiness; в production всегда `true`      |
| `DOCUMENT_OCR_LANGUAGES`               | comma-separated allowlist `eng,rus,lav`                           |
| `DOCUMENT_OCR_TIMEOUT_MS`              | timeout каждого безопасного subprocess                            |
| `DOCUMENT_OCR_MAX_PAGES`               | максимальное число PDF-страниц                                    |
| `DOCUMENT_OCR_MAX_FILE_SIZE`           | лимит исходного файла в bytes                                     |
| `DOCUMENT_TEXT_MIN_CHARACTERS`         | минимальный объём текста                                          |
| `DOCUMENT_TEXT_MIN_PRINTABLE_RATIO`    | минимальная доля printable symbols                                |
| `DOCUMENT_TEXT_MIN_ALPHANUMERIC_RATIO` | минимальная доля letters/numbers                                  |
| `DOCUMENT_DETECTION_MIN_CONFIDENCE`    | порог manual review                                               |
| `DOCUMENT_INTELLIGENCE_VERSION`        | версия правил и metadata                                          |

Некорректные значения отклоняются централизованно. Production не использует неявно отключённый OCR и запрещает исключать настроенный OCR из overall readiness. В development и обычном PostgreSQL/MinIO integration environment OCR отключён или optional, поэтому его отсутствие не маскирует состояние core pipeline.

## Reprocess

Только ADMIN API и server-side CLI могут повторно поставить один существующий документ:

```bash
npm run documents:reprocess -- --id=<document-id> --dry-run
npm run documents:reprocess -- --id=<document-id>
```

Tenant берётся из session или `DOCUMENT_WORKER_TENANT_ID`; `companyId` клиента не принимается. Queue enqueue идемпотентен, оригинал сохраняется, массового reprocess нет.

## Health и тесты

```bash
npm run documents:ocr-check
npm run documents:intelligence-health
npm run test
npm run test:ocr-integration
```

`npm test` использует fake provider и не требует Tesseract/Docker. OCR integration запускается отдельно и требует явного runtime.

Document health возвращает отдельные `core` и `documentIntelligence` component groups. OCR имеет явные состояния runtime, language data и PDF support. Статус `disabled` или `unavailable` остаётся видимым в diagnostics, но влияет на overall readiness только при `DOCUMENT_OCR_REQUIRED_FOR_READINESS=true`.

Финальные gates TASK-003 пройдены: 16 PostgreSQL/MinIO/local queue integration tests, integration health/worker checks, 73 unit/security tests и отдельный Docker OCR test с реальными Tesseract/Poppler. Production readiness не ослаблен и всегда требует настроенный OCR provider в overall readiness.

## Ограничения

Поиск остаётся лексическим. AI Gateway, embeddings, vector storage, semantic/hybrid retrieval, citations и evaluation перенесены в [TASK-004](./tasks/TASK-004.md). Cloud OCR требует отдельного решения и не входит в TASK-004.
