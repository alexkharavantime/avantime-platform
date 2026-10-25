-- One-time reconciliation check for migration 20260930130000_password_reset_tokens.
--
-- Databases created from the historical account baseline already contain the
-- "PasswordResetToken" table, so the migration fails with "relation already exists".
-- When this check succeeds, the migration may be recorded with
-- `prisma migrate resolve --applied 20260930130000_password_reset_tokens`.
--
-- Outcomes:
-- * succeeds: the migration is not recorded and the existing table matches it exactly;
-- * AVANTIME_RECONCILE_NOT_REQUIRED: the migration is recorded or the table is absent;
-- * AVANTIME_RECONCILE_MISMATCH: the existing table differs and must be reviewed manually.
DO $reconcile$
DECLARE
  actual_columns TEXT;
  actual_constraints TEXT;
  actual_indexes TEXT;
BEGIN
  -- Nested so the history query is only planned when the history table exists.
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM "_prisma_migrations"
      WHERE migration_name = '20260930130000_password_reset_tokens'
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    ) THEN
      RAISE EXCEPTION 'AVANTIME_RECONCILE_NOT_REQUIRED: migration is already recorded';
    END IF;
  END IF;

  IF to_regclass('"PasswordResetToken"') IS NULL THEN
    RAISE EXCEPTION 'AVANTIME_RECONCILE_NOT_REQUIRED: table is absent and the migration creates it';
  END IF;

  SELECT string_agg(
      column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''),
      ',' ORDER BY column_name)
    INTO actual_columns
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'PasswordResetToken';

  SELECT string_agg(conname || ' ' || pg_get_constraintdef(oid), ',' ORDER BY conname)
    INTO actual_constraints
    FROM pg_constraint
    WHERE conrelid = '"PasswordResetToken"'::regclass;

  SELECT string_agg(
      indexname || ' ' || split_part(indexdef, ' USING ', 2), ',' ORDER BY indexname)
    INTO actual_indexes
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'PasswordResetToken'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%';

  IF actual_columns IS DISTINCT FROM
      'createdAt:timestamp without time zone:NO:CURRENT_TIMESTAMP,'
      || 'expiresAt:timestamp without time zone:NO:,'
      || 'id:text:NO:,'
      || 'tokenHash:text:NO:,'
      || 'usedAt:timestamp without time zone:YES:,'
      || 'userId:text:NO:'
    OR actual_constraints IS DISTINCT FROM
      'PasswordResetToken_pkey PRIMARY KEY (id),'
      || 'PasswordResetToken_userId_fkey FOREIGN KEY ("userId") REFERENCES "User"(id) '
      || 'ON UPDATE CASCADE ON DELETE CASCADE'
    OR actual_indexes IS DISTINCT FROM
      'PasswordResetToken_pkey btree (id),PasswordResetToken_tokenHash_key btree ("tokenHash")'
  THEN
    RAISE EXCEPTION 'AVANTIME_RECONCILE_MISMATCH: existing "PasswordResetToken" differs from migration 20260930130000_password_reset_tokens';
  END IF;
END
$reconcile$;
