# Tenant-aware Hybrid RAG

TASK-004 добавляет ADMIN-only semantic search и hybrid RAG поверх завершённых document chunks TASK-002/TASK-003. Tenant всегда берётся из server session или server-controlled worker configuration; `companyId` из client payload отклоняется.

## Индексация

После успешного document processing создаётся отдельный embedding job. `embeddingStatus` не смешивается с processing status и проходит состояния `PENDING`, `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, `QUARANTINED` или `DISABLED`.

Embedding worker:

1. получает tenant-scoped job с lease;
2. читает только `COMPLETED` document chunks;
3. сравнивает SHA-256 content hash каждого chunk;
4. отправляет изменившиеся chunks в AI Gateway настраиваемыми batches;
5. идемпотентно сохраняет vector, model, version и dimensions;
6. удаляет stale chunks и старые версии только после успешной новой индексации;
7. применяет retry/backoff и quarantine policy.

HTTP request не выполняет embeddings. Удаление или повторная обработка документа удаляет embedding job/vector records либо планирует новую индексацию.

## Vector storage

Production и integration используют PostgreSQL с расширением `pgvector`. Составной ключ и запросы включают `companyId`, `documentId`, `chunkId`, embedding model и version. SQL migration:

- включает `vector`;
- добавляет embedding metadata и job lifecycle;
- создаёт `DocumentChunkEmbedding`;
- проверяет `vector_dims(embedding) = dimensions`;
- добавляет tenant/model/status indexes без удаления legacy data.

Поиск допускает только текущие model/version/dimensions и документы с `status=COMPLETED`, `embeddingStatus=COMPLETED`, без soft delete. `FAILED`, `QUARANTINED`, deleted и чужие tenant records исключаются до выдачи результата.

## Retrieval

Доступны три режима одного ADMIN API `/api/documents/search`:

- `lexical` — нормализованный поиск по chunks с document type/date filters;
- `semantic` — query embedding через AI Gateway и cosine similarity с настраиваемым threshold;
- `hybrid` — параллельные lexical/semantic candidates, нормализация scores и детерминированное объединение.

Hybrid score использует `HYBRID_LEXICAL_WEIGHT` и `HYBRID_SEMANTIC_WEIGHT`. Результаты deduplicate по `documentId:chunkId`, ограничиваются `HYBRID_MAX_CHUNKS_PER_DOCUMENT`, `HYBRID_TOP_K` и `HYBRID_MIN_SCORE`, а API возвращает lexical, semantic и hybrid score components.

## Ответы и citations

`/api/documents/ask` выполняет retrieval, повторно проверяет metadata/chunk в текущем tenant и только затем создаёт immutable source IDs `S1`, `S2` и далее. Citation содержит document/chunk IDs, title, nullable page range, ограниченный excerpt, retrieval score и ADMIN-only link.

Документный текст помещается в отдельный `<untrusted_retrieved_documents>` boundary. System instructions запрещают выполнять команды из источников, придумывать факты или ссылаться на отсутствующий source ID. Неизвестные citation markers удаляются server-side. Если подтверждающих chunks нет или они не помещаются в context limit, provider не вызывается и возвращается `no_answer`.

TASK-005 сохраняет `sourcePageStart`, `sourcePageEnd`, segment index, extraction method, optional coordinates, confidence и provenance version. PDF text extraction и OCR сохраняют реальные page boundaries; citations используют page range. `null` допустим только для legacy/unsupported data.

## pgvector production strategy

Controlled comparison exact/IVFFlat/HNSW не обосновал ANN rollout: IVFFlat
получил Recall@K `0.2667`, HNSW сохранил recall `1.0`, но был медленнее exact и
создал больший индекс на проверенном малом dataset. Exact search остаётся default.
ANN разрешён отдельной additive migration только после representative test с
Recall@K не ниже `0.95` и улучшением p95 не менее `30%`.

```bash
npm run pgvector:load-test -- --integration --smoke
```

## Безопасный reindex

Reindex ограничен одним tenant/document:

```bash
npm run documents:reindex -- --document-id=<id> --dry-run
npm run documents:reindex -- --document-id=<id> --execute
```

Dry-run является default. Выполнение против production требует `ALLOW_PRODUCTION_DOCUMENT_REINDEX=1`, а против remote database — `ALLOW_REMOTE_DOCUMENT_REINDEX=1`. Массового destructive reindex нет.

## Evaluation

Synthetic dataset не содержит персональных или production данных и включает английские, латышские и русские вопросы, no-answer, prompt injection и tenant-isolation cases.

```bash
npm run documents:rag-evaluate
```

Runner публикует Recall@K, MRR, citation precision, no-answer correctness и tenant leakage count. Набор предназначен для regression gate, а не заменяет разметку реальных разрешённых материалов.

## Связанные документы

- [AI Gateway](./AI_GATEWAY.md)
- [Document Processing](./DOCUMENT_PROCESSING.md)
- [Document Operations](./DOCUMENT_OPERATIONS.md)
- [Document Intelligence](./DOCUMENT_INTELLIGENCE.md)
- [Architecture Decisions](./DECISIONS.md)
- [TASK-004](./tasks/TASK-004.md)
- [TASK-005](./tasks/TASK-005.md)
- [Observability](./OBSERVABILITY.md)
