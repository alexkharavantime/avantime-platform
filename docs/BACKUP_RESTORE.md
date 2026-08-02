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
Staging manifests additionally record application version, commit SHA and migration/schema
version so restore evidence can be correlated with the deployed artifact.

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
npm run staging:restore-rehearsal
```

The automated rehearsal creates/restores only the validated isolated database
`avantime_restore_rehearsal`, verifies migrations/tables and never targets the
current development or production database.
The staging command uses the separate `avantime_staging_restore_rehearsal` Compose service and
also verifies `NotificationOutbox` and `KnowledgeIndexEvent`. It never restores in place.

## Staging baseline

Before migration, run the one-shot backup job and verify a non-zero encrypted archive, mode-0600
manifest, both SHA-256 values and version metadata. The local named volume is only rehearsal
storage. Managed staging must copy archive/manifest to the externally referenced private backup
destination, verify the copied checksum and apply retention before treating it as durable.

Object storage uses a separate private backup bucket or provider versioning/inventory contract.
Read/write probes are not backups. Encryption-at-rest, lifecycle, immutability and cross-account
access remain provider responsibilities that require managed evidence.

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
- [Staging infrastructure](./STAGING_INFRASTRUCTURE.md)
- [TASK-015](./tasks/TASK-015.md)
