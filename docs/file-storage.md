# File storage

v1.2 stores real attachment bytes in `UPLOAD_DIR` or `.data/uploads`. This is suitable for one application server. For horizontal scaling, replace the adapter with S3-compatible storage and keep only the storage key in PostgreSQL.

In the staging and production compose files `UPLOAD_DIR` is `/var/lib/avantime-uploads` on a persistent named volume (`uploads` / `staging-uploads`). The volume must be backed up together with the database: see "Request attachment volume backup" in [BACKUP_RESTORE.md](./BACKUP_RESTORE.md).
