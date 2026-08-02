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

TASK-015 adds a durable provider-backed governance outbox, separate worker and test/Resend adapters.
Repository/local validation can now exercise concurrency, retry and DLQ. Real managed terminal
delivery remains `PENDING` until a verified sender, synthetic recipient and provider receipt are
available; provider acceptance alone still cannot pass this validator. Production thresholds and
identity email security are unchanged.
