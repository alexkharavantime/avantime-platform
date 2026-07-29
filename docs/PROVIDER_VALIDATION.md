# Staging Provider Validation

## Static gate

```bash
npm run staging:provider-check
```

The check validates selected provider, credential presence, official HTTPS
endpoint allowlist, model names, embedding dimensions and timeout. Fake mode
requires `STAGING_ALLOW_FAKE_PROVIDER=true` and never satisfies the real provider
gate.

## Optional connectivity

No provider call is authorized by TASK-006 itself. After the user separately
authorizes it and staging credentials/cost reservation exist:

```bash
STAGING_PROVIDER_CONNECTIVITY_CONFIRMATION="PROVIDER_CHECK:staging-<id>" \
STAGING_PROVIDER_BUDGET_RESERVATION_ID="<ledger-reservation-id>" \
  npm run staging:provider-check -- --connectivity
```

OpenAI checks both model records and one tiny synthetic embedding. Gemini checks
one tiny synthetic embedding. The vector length must match configuration.
Request text is fixed synthetic metadata, never a document/user prompt. Raw
provider bodies, credentials and error messages are not logged.

Provider endpoints are limited to `api.openai.com` and
`generativelanguage.googleapis.com`. Private/loopback/custom hosts fail to reduce
SSRF risk. A future proxy needs a separate architecture/security decision.

## Related documents

- [AI Gateway](./AI_GATEWAY.md)
- [AI Cost Control](./AI_COST_CONTROL.md)
- [Security Hardening](./SECURITY_HARDENING.md)
- [TASK-006](./tasks/TASK-006.md)
