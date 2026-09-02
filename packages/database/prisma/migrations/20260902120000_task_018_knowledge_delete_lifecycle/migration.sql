-- Keep knowledge indexes consistent when an article is deleted outside the normal
-- publication lifecycle. The durable delete event contains metadata only and lets
-- the existing worker remove lexical/vector rows with source-version fencing.
CREATE OR REPLACE FUNCTION "enqueue_knowledge_index_event"() RETURNS trigger AS $$
DECLARE
  article_record "KnowledgeArticle"%ROWTYPE;
  event_suffix TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    article_record := OLD;
    event_suffix := ':delete';
  ELSE
    article_record := NEW;
    event_suffix := '';
  END IF;

  IF TG_OP IN ('INSERT', 'DELETE') THEN
    INSERT INTO "KnowledgeIndexEvent" (
      "id", "idempotencyKey", "articleId", "sourceVersion", "ownerScope",
      "companyId", "visibility", "lifecycleStatus", "updatedAt"
    ) VALUES (
      'knowledge-' || article_record."id" || '-' || article_record."version"::text || event_suffix,
      'knowledge:' || article_record."id" || ':' || article_record."version"::text || event_suffix,
      LEFT(article_record."id", 200), article_record."version", article_record."ownerScope",
      LEFT(article_record."companyId", 200), article_record."visibility",
      article_record."status", CURRENT_TIMESTAMP
    ) ON CONFLICT ("idempotencyKey") DO NOTHING;
  ELSIF NEW."version" IS DISTINCT FROM OLD."version"
     OR NEW."ownerScope" IS DISTINCT FROM OLD."ownerScope"
     OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
     OR NEW."visibility" IS DISTINCT FROM OLD."visibility"
     OR NEW."status" IS DISTINCT FROM OLD."status"
     OR NEW."quarantinedAt" IS DISTINCT FROM OLD."quarantinedAt" THEN
    INSERT INTO "KnowledgeIndexEvent" (
      "id", "idempotencyKey", "articleId", "sourceVersion", "ownerScope",
      "companyId", "visibility", "lifecycleStatus", "updatedAt"
    ) VALUES (
      'knowledge-' || article_record."id" || '-' || article_record."version"::text,
      'knowledge:' || article_record."id" || ':' || article_record."version"::text,
      LEFT(article_record."id", 200), article_record."version", article_record."ownerScope",
      LEFT(article_record."companyId", 200), article_record."visibility",
      article_record."status", CURRENT_TIMESTAMP
    ) ON CONFLICT ("idempotencyKey") DO NOTHING;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "KnowledgeArticle_enqueue_index_event" ON "KnowledgeArticle";
CREATE TRIGGER "KnowledgeArticle_enqueue_index_event"
AFTER INSERT OR UPDATE OR DELETE ON "KnowledgeArticle"
FOR EACH ROW EXECUTE FUNCTION "enqueue_knowledge_index_event"();
