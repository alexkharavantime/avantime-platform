# TLS Validation

## Automated checks

```bash
npm run staging:tls-check
```

The configured staging hostname is resolved, connected with TLS 1.2 minimum and
validated for chain/hostname/validity. Structured output includes days remaining,
protocol/cipher policy, HSTS, HTTP-to-HTTPS redirect and public exposure status;
raw certificate and secrets are not emitted.

Blocking conditions:

- invalid chain or hostname;
- expired certificate or fewer than 7 days remaining;
- TLS below 1.2 or weak cipher;
- missing HSTS with at least one-year max-age;
- missing HTTPS redirect;
- public database, Redis, object storage, worker or monitoring endpoint.

Thirty days remaining is a warning. Confirm weak ciphers and external exposure
with an approved external scanner. A production domain requires a separate
explicit procedure and is not accepted by staging configuration.

## Manual network verification

From an external network, verify only 80/443 are reachable. From the private
network, verify database/Redis/object/OTLP connectivity with service identities.
Document firewall/security-group rules and service-to-service TLS expectations
without recording addresses containing credentials.

## Related documents

- [Staging Architecture](./STAGING_ARCHITECTURE.md)
- [Security Hardening](./SECURITY_HARDENING.md)
- [TASK-006](./tasks/TASK-006.md)
