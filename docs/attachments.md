# Attachments

Version 1.1 registers attachment metadata and validates a 10 MB limit.

For production, connect an S3-compatible object store using the `OBJECT_STORAGE_*` variables. The current demo intentionally does not persist binary file contents; it provides the UI, API boundary and database model without pretending that local disk storage is production-safe.
