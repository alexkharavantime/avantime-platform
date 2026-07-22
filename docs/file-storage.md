# File storage

v1.2 stores real attachment bytes in `UPLOAD_DIR` or `.data/uploads`. This is suitable for one application server. For horizontal scaling, replace the adapter with S3-compatible storage and keep only the storage key in PostgreSQL.
