# @stratal/feature-flags

## 0.1.0

### Patch Changes

- ccb3f17: Released alongside the rest of the packages; nothing changed in this one.

  - No functional or API change ships here. Every Stratal package is versioned as one fixed group, so `@stratal/feature-flags` is republished at the same version as the packages it builds on rather than being left behind at the previous one. Its peer ranges on `stratal` and `@stratal/inertia` are open-ended, so an existing install keeps resolving — upgrade only to keep one aligned set of versions across the framework.

## 0.0.27

### Patch Changes

- 41a9140: Make feature flag evaluation resilient to runtime failures

  Flag evaluation now returns the fallback value and logs a warning if a lookup throws — for example when a remote-binding dev tunnel drops — rather than failing the request. Detail methods return an `ERROR` reason with the fallback in these cases.

- Updated dependencies [41a9140]
  - stratal@0.0.27
  - @stratal/inertia@0.0.27

## 0.0.26

### Patch Changes

- Updated dependencies [ab95f52]
- Updated dependencies [ab95f52]
- Updated dependencies [bb6d3b9]
  - stratal@0.0.26
  - @stratal/inertia@0.0.26

## 0.0.25

### Patch Changes

- Updated dependencies [e93db60]
- Updated dependencies [e93db60]
  - stratal@0.0.25
  - @stratal/inertia@0.0.25

## 0.0.24

### Patch Changes

- Updated dependencies [10cf223]
  - @stratal/inertia@0.0.24
  - stratal@0.0.24

## 0.0.23

### Patch Changes

- 13b0e8d: Add `@stratal/feature-flags` — Cloudflare Flagship feature flags via the native Worker binding API.

  - `FeatureFlagModule.forRoot({ apps: [{ binding, flags }], default, context })` with a declare-once flag manifest, manifest defaults, a per-request evaluation-context resolver, and multi-app support via `FeatureFlagService.use(binding)`.
  - `FeatureFlagShareMiddleware` shares evaluated flags to Inertia pages as the `featureFlags` prop; register it yourself (scoped to page controllers via `router.middleware(...)` or app-wide via `router.use(...)`) so a stalled Flagship binding can't block unrelated routes. Typed `useFlag` / `useFeatureFlags` hooks on `@stratal/feature-flags/react`. No runtime dependency on `@stratal/inertia`.
  - `@stratal/inertia`: expose a generic `ctx.share(key, value)` macro on `RouterContext` so middleware and packages can contribute per-request shared props.
  - `@stratal/framework`: add a `ctx.user()` macro on `RouterContext` (shorthand for `AuthContext.requireUser()`).

- 13b0e8d: Fix correctness and security issues found in review.

  Queue:

  - Retry the correct binding: dispatch stamps the producer binding into message metadata and failed jobs record it, so `queue:retry` re-enqueues through the Cloudflare binding instead of the queue name (which is not a valid binding key and broke retry whenever the two differed). A message with no binding metadata is logged and acked rather than stored as an unretryable job.
  - Honor the documented retry budget: `maxRetries` now counts retries correctly against Cloudflare's 1-based `message.attempts` (previously gave one fewer retry than configured).
  - Derive idempotency keys from an order-stable serialization of `type` + `payload`, so payloads that differ only in key order dedupe correctly.
  - `queue:retry --all` / `queue:purge --all --queue` collect matching keys before deleting, so cursor pagination no longer skips jobs; `queue:failed --queue --limit` now counts matching jobs rather than scanned keys.
  - Documented that delivery is at-least-once with best-effort de-duplication (not exactly-once), since the processed marker is written only after a handler succeeds and KV is eventually consistent — handlers must be idempotent.

  Email (SMTP):

  - Upgrade STARTTLS onto the socket `startTls()` returns: the original socket is closed by the runtime, so the post-upgrade reader/writer are re-derived from the new secure socket and any pre-handshake bytes are discarded (fixes a broken `smtp://` STARTTLS path on real Workers and closes the STARTTLS plaintext-injection vector).
  - Refuse to send credentials over an unencrypted connection: an `smtp://` server that doesn't offer STARTTLS now fails loudly instead of leaking the password (blocks STARTTLS-stripping downgrades). Credential-free connections (e.g. local Mailpit) are unaffected.
  - AUTH is gated on the server's advertised mechanisms and supports both `PLAIN` and `LOGIN`; usernames are percent-decoded like passwords.
  - Add a response timeout so a hung SMTP server can't wedge the worker; QUIT/socket close are now best-effort and never mask a successful send.
  - MIME builder strips CR/LF from headers, escapes/RFC 2231-encodes attachment filenames (prevents header injection), base64-encodes message bodies (fixes long-line corruption), and rejects envelope addresses containing whitespace or angle brackets (prevents `MAIL FROM`/`RCPT TO` desync).

  Inertia SEO:

  - `titleTemplate` substitutes every `%s` and treats `$`-sequences in the title literally.
  - Inject head/body content via function replacements, so SEO/page content containing `$`-sequences (`$$`, `$&`, `` $` ``, `$'`) is no longer corrupted or able to splice a template placeholder back into the output.
  - Drop unsafe attribute names — including inline event handlers (`on*`) — from custom `meta`/`link` entries (prevents tag breakout server-side, `setAttribute` errors during client head-sync, and developer-supplied event-handler attributes).

  Feature flags:

  - `FeatureFlagService.use()` binds the target app exactly once.

  Database (framework):

  - The reentrant `$transaction` proxy forwards the receiver for non-transaction property access.

  Testing:

  - `TestingModule.close()` drops the isolated per-file database even if shutdown throws; the stale-database sweep escapes LIKE metacharacters so a prefix containing `_` can't over-match.

  DI:

  - Construct singletons against the root container so they can never capture a request-scoped dependency (which would leak one request's state across every later request); an illegal singleton→request dependency now throws loudly.
  - Detect circular dependencies and throw a clear error naming the cycle instead of overflowing the stack.
  - `tryResolve` only swallows "no provider"; a registered provider that throws while constructing now surfaces the real error instead of injecting `undefined`.
  - Request-cache invalidation tracks transitive constructor dependencies, so re-registering a value rebuilds cached services that depend on it through a transient intermediary.

  Quarry dev runtime:

  - Persist every durable plugin (KV, D1, R2, Durable Objects, cache) under `.wrangler/state/v3`, matching `wrangler dev` (previously only R2 was persisted); load `.env.local` / `.env.<env>.local` into `process.env` for full parity.
  - The `cloudflare:sockets` STARTTLS shim re-attaches the stream error handler to the upgraded socket, so post-upgrade connection errors still surface.

- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [be813bc]
  - stratal@0.0.23
  - @stratal/inertia@0.0.23
