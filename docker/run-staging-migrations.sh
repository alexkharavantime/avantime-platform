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

# Some databases already contain the tables a migration creates (the historical baseline has
# "PasswordResetToken"; `prisma db push` created the portal settings, e-mail and system event
# tables). Record such a migration only when the existing tables match it exactly, and fail
# closed on any difference. See packages/database/prisma/reconciliation.
reconcile() {
  migration="$1"
  reconcile_check="packages/database/prisma/reconciliation/${migration}.sql"
  reconcile_log='/tmp/avantime-staging-migration-reconcile.log'
  if node_modules/.bin/prisma db execute --file "$reconcile_check" --schema "$schema" >"$reconcile_log" 2>&1; then
    node_modules/.bin/prisma migrate resolve --applied "$migration" --schema "$schema"
    printf '%s\n' "Reconciled existing tables with ${migration}."
  elif ! grep -q 'AVANTIME_RECONCILE_NOT_REQUIRED' "$reconcile_log"; then
    cat "$reconcile_log"
    exit 1
  fi
  rm -f "$reconcile_log"
}

reconcile '20260930130000_password_reset_tokens'
reconcile '20261104120000_portal_settings_email_system_events'

exec node_modules/.bin/prisma migrate deploy --schema "$schema"
