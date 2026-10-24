#!/bin/sh
set -eu

schema='packages/database/prisma/schema.prisma'
baseline='packages/database/prisma/staging-empty-database-baseline.sql'
first_migration='20260727150000_document_metadata_persistence'
resolve_log='/tmp/avantime-staging-migration-resolve.log'

node_modules/.bin/prisma db execute --file "$baseline" --schema "$schema"

if ! node_modules/.bin/prisma migrate resolve --applied "$first_migration" --schema "$schema" >"$resolve_log" 2>&1; then
  if grep -q 'P3008' "$resolve_log"; then
    printf '%s\n' 'Historical staging baseline is already registered.'
  else
    cat "$resolve_log"
    exit 1
  fi
fi
rm -f "$resolve_log"

# The historical baseline already contains "PasswordResetToken"; record its migration only
# when the existing table matches it exactly, and fail closed on any difference.
password_reset_migration='20260930130000_password_reset_tokens'
reconcile_check="packages/database/prisma/reconciliation/${password_reset_migration}.sql"
reconcile_log='/tmp/avantime-staging-migration-reconcile.log'
if node_modules/.bin/prisma db execute --file "$reconcile_check" --schema "$schema" >"$reconcile_log" 2>&1; then
  node_modules/.bin/prisma migrate resolve --applied "$password_reset_migration" --schema "$schema"
  printf '%s\n' "Reconciled existing PasswordResetToken table with ${password_reset_migration}."
elif ! grep -q 'AVANTIME_RECONCILE_NOT_REQUIRED' "$reconcile_log"; then
  cat "$reconcile_log"
  exit 1
fi
rm -f "$reconcile_log"

exec node_modules/.bin/prisma migrate deploy --schema "$schema"
