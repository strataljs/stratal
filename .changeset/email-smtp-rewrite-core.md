---
"stratal": patch
---

Replace the email provider layer with a built-in Cloudflare Workers-compatible SMTP client and defer React Email rendering

- Email is now sent through a built-in SMTP client and MIME builder, removing the runtime dependency on `nodemailer`.
- `@react-email/render` is loaded on demand only when sending a React template, reducing cold-start overhead for requests that don't send email.

### Breaking Changes

- **Resend provider removed.** Switch to SMTP. Remove the `provider` and `apiKey` options from your email configuration and remove `resend` from your dependencies.
- **SMTP configuration uses a connection URL.** Replace individual `host`/`port`/`secure`/`username`/`password` fields with a single `url`:

  ```ts
  // Before
  smtp: { host: 'smtp.example.com', port: 587, username: 'user', password: 'pass' }
  // After
  smtp: { url: 'smtp://user:pass@smtp.example.com:587' } // or smtps:// for TLS
  ```

- **Dependencies changed.** `nodemailer`, `resend`, and `@react-email/components` are no longer peer dependencies. If you render React email templates, install `@react-email/render` directly.
