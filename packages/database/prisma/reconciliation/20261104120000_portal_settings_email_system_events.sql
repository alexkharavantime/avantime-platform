-- One-time reconciliation check for migration 20261104120000_portal_settings_email_system_events.
--
-- Databases built with `prisma db push` already contain "NotificationPreference", "SystemEvent",
-- "EmailMessage" and the "EmailStatus" enum, so the migration fails with "already exists".
-- When this check succeeds, the migration may be recorded with
-- `prisma migrate resolve --applied 20261104120000_portal_settings_email_system_events`.
-- The check changes nothing.
--
-- Outcomes:
-- * succeeds: the migration is not recorded and all four objects exist and match it exactly;
-- * AVANTIME_RECONCILE_NOT_REQUIRED: the migration is recorded or none of the objects exists;
-- * AVANTIME_RECONCILE_MISMATCH: only some objects exist or one of them differs; review manually.
DO $reconcile$
DECLARE
  present INTEGER;
  actual TEXT;
  expected TEXT;
  object_name TEXT;
BEGIN
  -- Nested so the history query is only planned when the history table exists.
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM "_prisma_migrations"
      WHERE migration_name = '20261104120000_portal_settings_email_system_events'
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    ) THEN
      RAISE EXCEPTION 'AVANTIME_RECONCILE_NOT_REQUIRED: migration is already recorded';
    END IF;
  END IF;

  present := (to_regclass('"NotificationPreference"') IS NOT NULL)::INTEGER
    + (to_regclass('"SystemEvent"') IS NOT NULL)::INTEGER
    + (to_regclass('"EmailMessage"') IS NOT NULL)::INTEGER
    + (to_regtype('"EmailStatus"') IS NOT NULL)::INTEGER;
  IF present = 0 THEN
    RAISE EXCEPTION 'AVANTIME_RECONCILE_NOT_REQUIRED: objects are absent and the migration creates them';
  END IF;
  IF present < 4 THEN
    RAISE EXCEPTION 'AVANTIME_RECONCILE_MISMATCH: only % of the 4 objects of migration 20261104120000_portal_settings_email_system_events exist', present;
  END IF;

  SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder)
    INTO actual
    FROM pg_enum
    WHERE enumtypid = '"EmailStatus"'::regtype;
  IF actual IS DISTINCT FROM 'PENDING,SENDING,SENT,FAILED' THEN
    RAISE EXCEPTION 'AVANTIME_RECONCILE_MISMATCH: existing "EmailStatus" differs from migration 20261104120000_portal_settings_email_system_events';
  END IF;

  FOR object_name, expected IN
    VALUES
      ('NotificationPreference',
        'id:text:text::NO:,'
        || 'newMessage:boolean:bool::NO:true,'
        || 'requestCreated:boolean:bool::NO:true,'
        || 'requestUpdated:boolean:bool::NO:true,'
        || 'slaAlerts:boolean:bool::NO:true,'
        || 'updatedAt:timestamp without time zone:timestamp:3:NO:,'
        || 'userId:text:text::NO:,'
        || 'weeklySummary:boolean:bool::NO:false'
        || '|NotificationPreference_pkey PRIMARY KEY (id),'
        || 'NotificationPreference_userId_fkey FOREIGN KEY ("userId") REFERENCES "User"(id) '
        || 'ON UPDATE CASCADE ON DELETE CASCADE'
        || '|NotificationPreference_pkey btree (id),'
        || 'NotificationPreference_userId_key btree ("userId")'),
      ('SystemEvent',
        'actorEmail:text:text::YES:,'
        || 'category:text:text::NO:,'
        || 'createdAt:timestamp without time zone:timestamp:3:NO:CURRENT_TIMESTAMP,'
        || 'id:text:text::NO:,'
        || 'level:text:text::NO:''INFO''::text,'
        || 'message:text:text::NO:,'
        || 'metadata:jsonb:jsonb::YES:'
        || '|SystemEvent_pkey PRIMARY KEY (id)'
        || '|SystemEvent_pkey btree (id)'),
      ('EmailMessage',
        'attempts:integer:int4::NO:0,'
        || 'createdAt:timestamp without time zone:timestamp:3:NO:CURRENT_TIMESTAMP,'
        || 'htmlBody:text:text::YES:,'
        || 'id:text:text::NO:,'
        || 'lastError:text:text::YES:,'
        || 'providerId:text:text::YES:,'
        || 'recipient:text:text::NO:,'
        || 'scheduledAt:timestamp without time zone:timestamp:3:NO:CURRENT_TIMESTAMP,'
        || 'sentAt:timestamp without time zone:timestamp:3:YES:,'
        || 'status:USER-DEFINED:EmailStatus::NO:''PENDING''::"EmailStatus",'
        || 'subject:text:text::NO:,'
        || 'template:text:text::NO:,'
        || 'textBody:text:text::NO:,'
        || 'updatedAt:timestamp without time zone:timestamp:3:NO:,'
        || 'userId:text:text::YES:'
        || '|EmailMessage_pkey PRIMARY KEY (id),'
        || 'EmailMessage_userId_fkey FOREIGN KEY ("userId") REFERENCES "User"(id) '
        || 'ON UPDATE CASCADE ON DELETE SET NULL'
        || '|EmailMessage_pkey btree (id),'
        || 'EmailMessage_status_scheduledAt_idx btree (status, "scheduledAt")')
  LOOP
    SELECT
      (SELECT string_agg(
          column_name || ':' || data_type || ':' || udt_name || ':'
            || coalesce(datetime_precision::text, '') || ':' || is_nullable || ':'
            || coalesce(column_default, ''),
          ',' ORDER BY column_name)
        FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = object_name)
      || '|' || (SELECT string_agg(conname || ' ' || pg_get_constraintdef(oid), ',' ORDER BY conname)
        FROM pg_constraint
        WHERE conrelid = format('%I', object_name)::regclass)
      || '|' || (SELECT string_agg(indexname || ' ' || split_part(indexdef, ' USING ', 2), ',' ORDER BY indexname)
        FROM pg_indexes
        WHERE schemaname = current_schema() AND tablename = object_name)
      INTO actual;
    IF actual IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'AVANTIME_RECONCILE_MISMATCH: existing "%" differs from migration 20261104120000_portal_settings_email_system_events', object_name;
    END IF;
  END LOOP;
END
$reconcile$;
