#!/bin/sh
set -eu

schema='packages/database/prisma/schema.prisma'
baseline='packages/database/prisma/staging-empty-database-baseline.sql'
first_migration='20260727150000_document_metadata_persistence'
resolve_log='/tmp/avantime-staging-migration-resolve.log'

npx prisma db execute --file "$baseline" --schema "$schema"

if ! npx prisma migrate resolve --applied "$first_migration" --schema "$schema" >"$resolve_log" 2>&1; then
  if grep -q 'P3008' "$resolve_log"; then
    printf '%s\n' 'Historical staging baseline is already registered.'
  else
    cat "$resolve_log"
    exit 1
  fi
fi
rm -f "$resolve_log"
exec npx prisma migrate deploy --schema "$schema"
