# Backup and Restore

## Scope and targets

Backups cover PostgreSQL/pgvector, metadata, jobs, AI ledger/audit/migration
history and S3-compatible objects. Configuration manifests contain references and
versions only; secrets are backed up by the approved secret manager.

Initial unverified targets:

- RPO: 15 minutes for PostgreSQL with PITR, 24 hours for object backup;
- RTO: 4 hours for a single-region service restore;
- retention: 7 daily, 5 weekly and 12 monthly copies.

These are proposed targets until staging/production measurements confirm them.

## PostgreSQL backup

```bash
npm run backup:dry-run
BACKUP_CONFIRMATION="BACKUP:<environment>" npm run backup:create -- --execute
```

The command uses `pg_dump` without a shell, validates environment/output paths,
encrypts the custom archive with AES-256-GCM, removes the temporary plaintext and
writes a mode-`0600` manifest with encrypted/source SHA-256 checksums. Restore
requires the runtime-injected encryption key and decrypts only inside a temporary
directory. Backup storage must additionally encrypt at rest and in transit.
PostgreSQL PITR requires continuous WAL archiving managed by the selected provider.

The reference Compose mounts `/var/lib/avantime-backups` as a dedicated persistent
volume so the encrypted archive does not disappear with the operations container.
That volume is only a reference staging target: an approved deployment must copy
the archive and manifest to isolated backup storage, verify the copied checksum,
apply immutable retention and only then report the backup as durable.

## Object storage backup

```bash
npm run backup:objects
BACKUP_CONFIRMATION="BACKUP:<environment>" npm run backup:objects -- --execute
```

Objects are copied to a different private bucket/policy boundary. Production uses
`BACKUP_OBJECT_STORAGE_SSE=AES256` and verifies destination size, metadata and
manifest checksum. The guarded local integration environment may set `none`
because MinIO without KMS rejects SSE-S3; this exception is denied in production.
Enable provider versioning/object lock/replication according to data policy.

## Restore rehearsal

```bash
npm run restore:rehearsal:integration
```

The automated rehearsal creates/restores only the validated isolated database
`avantime_restore_rehearsal`, verifies migrations/tables and never targets the
current development or production database.

A manual restore requires:

- `RESTORE_REHEARSAL_ALLOWED=true`;
- target name ending in `restore_rehearsal`;
- exact `RESTORE_CONFIRMATION=RESTORE:<database>`;
- remote/production allow flags only in an approved staging procedure.

## Verification

- archive/checksum present and non-zero;
- expected migration count and critical tables;
- tenant-scoped metadata/vector counts;
- object count/bytes and sampled checksum;
- queue reconciliation from PostgreSQL lifecycle;
- health, OCR, embedding/RAG and budget smoke checks;
- recorded `RecoveryOperation` and persistent audit event.

## Safety and rollback limitations

Restore is never performed in place by default. If rehearsal verification fails,
destroy only the isolated target through the integration guard, preserve evidence
and keep the source backup unchanged. Additive migrations are not automatically
rolled back; application rollback must remain schema-compatible.

## Рекомендации по улучшению

- Test PITR to an exact timestamp with the selected PostgreSQL provider.
- Add cross-account/region object replication and immutable retention.
- Sample full-content checksums under an approved privacy-safe process.

## Связанные документы

- [Disaster Recovery](./DISASTER_RECOVERY.md)
- [Production Deployment](./PRODUCTION_DEPLOYMENT.md)
- [Production Readiness Checklist](./PRODUCTION_READINESS_CHECKLIST.md)
- [Security Hardening](./SECURITY_HARDENING.md)
- [TASK-005](./tasks/TASK-005.md)
