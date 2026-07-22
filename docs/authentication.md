# Authentication and account model

Version 1.0 replaces the unsigned demo cookie with a signed, HTTP-only session.

## Modes

- With `DATABASE_URL`: users and roles are loaded from PostgreSQL.
- Without PostgreSQL: two explicit demo accounts remain available for local preview.

## Security baseline

- Passwords are stored as PBKDF2-SHA256 hashes with individual salts.
- Session payloads are signed with HMAC-SHA256.
- Cookies are HTTP-only, SameSite=Lax and Secure in production.
- Server pages verify both authentication and role.

Set a long random `SESSION_SECRET` before deployment. The demo fallback must be disabled before a public production launch.
