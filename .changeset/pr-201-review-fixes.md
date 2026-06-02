---
"stratal": patch
"@stratal/inertia": patch
"@stratal/feature-flags": patch
"@stratal/framework": patch
"@stratal/testing": patch
---

Fix correctness and security issues found in review.

Queue:
- Honor the documented retry budget: `maxRetries` now counts retries correctly against Cloudflare's 1-based `message.attempts` (previously gave one fewer retry than configured).
- Derive idempotency keys from an order-stable serialization of `type` + `payload`, so payloads that differ only in key order dedupe correctly.
- `queue:retry --all` / `queue:purge --all --queue` collect matching keys before deleting, so cursor pagination no longer skips jobs; `queue:failed --queue --limit` now counts matching jobs rather than scanned keys.

Email (SMTP):
- Refuse to send credentials over an unencrypted connection: an `smtp://` server that doesn't offer STARTTLS now fails loudly instead of leaking the password (blocks STARTTLS-stripping downgrades). Credential-free connections (e.g. local Mailpit) are unaffected.
- AUTH is gated on the server's advertised mechanisms and supports both `PLAIN` and `LOGIN`; usernames are percent-decoded like passwords.
- Add a response timeout so a hung SMTP server can't wedge the worker; QUIT/socket close are now best-effort and never mask a successful send.
- MIME builder strips CR/LF from headers, escapes/RFC 2231-encodes attachment filenames (prevents header injection), and base64-encodes message bodies (fixes long-line corruption).

Inertia SEO:
- `titleTemplate` substitutes every `%s` and treats `$`-sequences in the title literally.
- Drop unsafe attribute names from custom `meta`/`link` entries (prevents tag breakout server-side and `setAttribute` errors during client head-sync).

Feature flags:
- `FeatureFlagService.use()` binds the target app exactly once.

Database (framework):
- The reentrant `$transaction` proxy forwards the receiver for non-transaction property access.

Testing:
- `TestingModule.close()` drops the isolated per-file database even if shutdown throws; the stale-database sweep escapes LIKE metacharacters so a prefix containing `_` can't over-match.

DI:
- Request-cache invalidation tracks transitive constructor dependencies, so re-registering a value rebuilds cached services that depend on it through a transient intermediary.
