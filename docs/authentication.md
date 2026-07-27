# Authentication and account model

Version 1.0 replaces the unsigned demo cookie with a signed, HTTP-only session.

## Modes

- With `DATABASE_URL`: users and roles are loaded from PostgreSQL.
- Without PostgreSQL: local demo accounts are available only when
  `ENABLE_DEMO_AUTH="true"` and `NODE_ENV` is not `production`.

## Security baseline

- Passwords are stored as PBKDF2-SHA256 hashes with individual salts.
- Session payloads are signed with HMAC-SHA256.
- `SESSION_SECRET` is mandatory, must contain at least 32 characters and is never
  replaced by a predictable fallback.
- Cookies are HTTP-only, SameSite=Lax and Secure in production.
- Server pages verify both authentication and role.

Production startup fails with a clear configuration error when `SESSION_SECRET`
is absent or too short. Demo authentication is always denied in production.
