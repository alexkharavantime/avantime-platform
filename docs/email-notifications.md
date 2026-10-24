# Email notifications

Identity mail uses Resend when `IDENTITY_EMAIL_DRIVER=resend`, `RESEND_API_KEY` and `MAIL_FROM`
are configured. `MAIL_FROM` must use a sending domain verified in the Resend account; a recipient
address is not a sender identity. Never commit the API key.

Access-request review mail is sent to `ACCESS_REQUEST_NOTIFICATION_EMAIL` after the applicant
confirms their email. This recipient is independent of the requestor/login address and `MAIL_FROM`.
For this installation, set `ACCESS_REQUEST_NOTIFICATION_EMAIL=alexander@solutions.lv` in the local
environment file or deployment configuration. Production configuration requires a valid recipient.

Email links use `IDENTITY_PUBLIC_BASE_URL` when set, then `AUTH_PUBLIC_ORIGIN` in production or
`APP_URL` locally. In local development, `APP_URL=http://localhost:3000` is suitable only when the
recipient opens the message on the same machine running the app. For another device, set the base
URL to an already reachable HTTPS address; this does not publish the app or change DNS.
Non-production identity mail is intentionally suppressed.

The existing email queue, Resend adapter, templates and user preferences remain available. Admin
page: `/admin/email-queue`.
