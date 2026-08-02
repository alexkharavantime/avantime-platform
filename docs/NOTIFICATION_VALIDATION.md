# Governance notification validation

The validator accepts only sanitized delivery receipts for bootstrap, role change, support
start/end, approval request/decision/expiry and knowledge publish/archive. Each receipt requires a
unique provider message ID, hashed synthetic recipient, safe template ID, correlation ID,
attempt/delivery timestamps and delivered status. Raw recipient, subject, body, headers, request,
response, token and provider credential are forbidden.

Provider acceptance is not delivery. The managed operator must obtain the provider's terminal
delivery event with bounded polling and record retry/failure/dead-letter visibility. Missing,
failed, duplicate or incomplete events make `governance validate notifications` non-zero.
The validation bundle also requires one synthetic failure observation with at least two attempts,
a safe failure code and visible dead-letter state; it never treats that drill as a delivered event.

Current repository governance operations create durable in-product notification rows but do not
have a provider-backed governance outbox. Therefore real managed delivery is a documented blocker,
with status `BLOCKED`, not a simulated pass. The validator is provider-neutral so an outbox/provider adapter can supply
the same receipt schema without changing evidence policy. Production thresholds and identity email
security are unchanged.
