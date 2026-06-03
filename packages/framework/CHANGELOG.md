# @stratal/framework

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

- 13b0e8d: Make database transactions reentrant and remove `AuthContextMiddleware`

  - Nested `$transaction` calls now reuse the active transaction instead of acquiring a second connection, fixing deadlocks on single-connection pools (e.g. Hyperdrive with `max: 1`) when libraries such as Better Auth run nested transactions.

  ### Breaking Changes

  - **`AuthContextMiddleware` is removed.** Auth context is now registered automatically per request. If you registered this middleware explicitly, remove the registration — `SessionVerificationMiddleware` is sufficient.

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

## 0.0.22

### Patch Changes

- 1658945: Migrate all error classes to `HttpException`, move heavy dependencies to peer dependencies

  ### Breaking Changes

  - **Error classes migrated** — All framework error classes (`InsufficientPermissionsError`, auth errors, database errors, context errors) now extend `HttpException` instead of `ApplicationError`. Constructor signatures are simplified — remove `i18nKey` and `code` arguments.
  - **`@better-auth/core`, `@zenstackhq/orm`, `@zenstackhq/schema`, and `better-auth` moved to peer dependencies** — Install them directly in your application if not already present.
  - **Database error mapping simplified** — `fromZenStackError()` no longer maps to typed error code objects. It returns plain `HttpException` instances with descriptive messages.

- 4b273ea: Adapt to the new built-in DI container from `stratal`, removing all `tsyringe` and `reflect-metadata` usage

  - All request-scoped services now use the `@Request` decorator instead of `@Transient`.
  - `DatabaseModule` uses `lazy()` for dynamic connection registration instead of tsyringe's `delay()`.
  - `reflect-metadata` is no longer required as a peer dependency.

- Updated dependencies [1658945]
- Updated dependencies [4b273ea]
  - stratal@0.0.22

## 0.0.21

### Patch Changes

- 3489cfd: Require `name` on `AuthUser`

  `AuthUser` now extends Better Auth's `BaseUser` directly, so `name` is required again (it was temporarily made optional in `0.0.20`). Apps whose schema stores `firstName`/`lastName` instead of a `name` column should expose `name` through a [ZenStack result extension](https://zenstack.dev/docs/orm/plugins/extending-orm-client#adding-fields-to-query-results) so reads return a populated `name` for free, rather than relying on `name` being absent.

- Updated dependencies [3489cfd]
- Updated dependencies [3489cfd]
  - stratal@0.0.21

## 0.0.20

### Patch Changes

- f8c61e1: Auto-wire Better Auth's rate limiting through Stratal's `RateLimiterModule`

  When `RateLimiterModule` is imported alongside `AuthModule`, Better Auth's `rateLimit` block is configured automatically:

  - `customStorage` is backed by Stratal's shared `IRateLimiterStore`, so HTTP throttling and Better Auth share one store.
  - `customRules` is populated from a new `RateLimiterRegistry.forPath(path, resolver)` API, letting apps declare path-keyed limits (e.g. `/sign-in/email`, `/two-factor/*`) using the same `Limit` builder used elsewhere.
  - User-supplied `rateLimit.customStorage` and `rateLimit.customRules` keys take precedence on a per-key basis.

  ```ts
  limiter.forPath("/sign-in/email", () => Limit.perSeconds(10, 3));
  limiter.forPath("/forget-password", () => Limit.none()); // disabled
  ```

  Path-keyed entries are scoped per-IP+path by Better Auth (`Limit.by(...)` is ignored), and multiple `Limit`s reduce to the most restrictive (smallest `max / windowSeconds`).

- f8c61e1: Store the full authenticated user on `AuthContext`

  `AuthContext` now holds the full user record returned by Better Auth's `getSession()` instead of just `userId`/`role`, so controllers and services can read profile fields without re-querying the database.

  ### Breaking Changes

  - `AuthInfo` shape changed from `{ userId?, role? }` to `{ user: AuthUser }`. `setAuthContext({ userId, role })` callers must pass `setAuthContext({ user })` instead.
  - `getAuthContext()` was renamed to `getAuthInfo()` and now returns `{ user }`.
  - `AuthContext.getRole()` reads from `user.role`. Apps that use roles should augment the new `AuthUser` interface with `role: string` (or your app's role field) so it stays typed.

  ### New API

  - `AuthUser` interface (extends Better Auth's `BaseUser` with optional `name`) is augmentable via `declare module '@stratal/framework/context'` for app-specific fields.
  - `AuthContext.getUser()` returns the user or `undefined`.
  - `AuthContext.requireUser()` returns the user or throws `UserNotAuthenticatedError`.

  ### Migration

  ```ts
  // Before
  const userId = authContext.getAuthContext().userId;
  authContext.setAuthContext({
    userId: session.user.id,
    role: session.user.role,
  });

  // After
  const user = authContext.requireUser();
  authContext.setAuthContext({ user: session.user });
  ```

- f8c61e1: Add `better-call@1.3.5` as a direct dependency

  `@better-auth/core@1.6.9` declares `better-call` as a peer dependency but does not install it itself, so the framework — its direct consumer — is responsible for providing it. Without it, stricter resolvers (e.g. Cloudflare's workerd vitest pool) fail to resolve `better-call/error` from `@better-auth/core`.

- f8c61e1: Support `@computed` fields in `DatabaseModule` connection config

  `DatabaseConnectionConfig` accepts a new optional `computedFields` map that is forwarded to the underlying ZenStack client. ZenStack 3+ requires this whenever the schema declares any `@computed` fields; previously the connection failed to construct.

- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
  - stratal@0.0.20

## 0.0.19

### Patch Changes

- 3b16f5b: Replace Casbin-based RBAC module with Better Auth access control module

  ### Breaking Changes

  - The `RbacModule`, `CasbinService`, `CasbinEnforcerService`, and all Casbin-related exports under `@stratal/framework/rbac` have been removed.
  - Use the new `@stratal/framework/access-control` module instead, which integrates with Better Auth's built-in access control system.
  - `AuthGuard` now uses `AccessService` instead of `CasbinService` for permission checks.

  ### Migration

  1. Replace `RbacModule` imports with the new access control setup via `createAccessControl()`.
  2. Define resources and roles using `createAccessControl({ resources, roles })` and pass the result to `AuthModule.forRootAsync()`.
  3. Replace `CasbinService` usage with `AccessService` from `@stratal/framework/access-control`.

- 3b16f5b: Add organization-related error handling and internationalization support for auth module

  - Add structured error codes and i18n messages for organization operations (not found, member not found, invitation errors, limit reached).
  - Enhance Better Auth error handler to map organization-specific errors to appropriate HTTP responses.

- 5d26c24: Rearchitect i18n module augmentation to a per-module keyed registry (breaking change)

  **Why:** Multiple modules augmenting `AppMessages` with a shared top-level parent (e.g., `errors.auth`, `errors.uploads`, `errors.branding`) collided with TypeScript error **TS2717** ("Subsequent property declarations must have the same type"). Interface merging adds new properties across declarations but requires same-named properties to have structurally identical types — it does not deep-merge nested shapes.

  **What changed:**

  - Replaced the single augmentable `AppMessages` interface with an `AppMessageNamespaces` keyed registry. Each module declares its own distinct top-level key (Laravel-style package namespacing). Because each declaration adds a different property, interface merging accepts them all.
  - `AppMessages` is now derived: `{ [K in keyof AppMessageNamespaces]: AppMessageNamespaces[K] }`.
  - Access keys are unchanged dot-notation — `i18n.t('auth.errors.invalidCredentials')` — so no custom resolver is needed.

  **Migration:**

  Before:

  ```ts
  declare module "stratal/i18n" {
    interface AppMessages {
      errors: { uploads: { notFound: string } };
    }
  }
  ```

  After:

  ```ts
  declare module "stratal/i18n" {
    interface AppMessageNamespaces {
      uploads: { errors: { notFound: string } };
    }
  }
  ```

  **Framework package moves:**

  - All `errors.auth.*` keys (previously split between `stratal` core and `@stratal/framework`) now live in the auth module as `auth.errors.*`. `errors.auth.org.*` → `auth.org.*`. The `errors.auth.*` namespace has been removed from `stratal`'s core messages.
  - `@stratal/framework`'s `DatabaseModule` now registers its `database.*` validation messages via `I18nModule.registerMessages` (previously the messages file existed but was never wired up).
  - `@stratal/inertia-modal`'s `errors.modal.*` key moved to `modal.errors.*`.

  **Callsite updates required in downstream apps:**

  ```ts
  // Before
  new ApplicationError('errors.auth.invalidCredentials', ...)
  i18n.t('errors.auth.org.organizationNotFound')

  // After
  new ApplicationError('auth.errors.invalidCredentials', ...)
  i18n.t('auth.org.organizationNotFound')
  ```

  No runtime API change: `I18nModule.registerMessages(messages)` keeps its existing signature, and deep-merge behavior is unchanged. Locale-only contributions that override core's built-in `errors.*` / `common.*` / etc. continue to work.

- Updated dependencies [3b16f5b]
- Updated dependencies [5d26c24]
- Updated dependencies [3b16f5b]
- Updated dependencies [3b16f5b]
- Updated dependencies [5d26c24]
- Updated dependencies [5d26c24]
- Updated dependencies [3b16f5b]
  - stratal@0.0.19

## 0.0.18

### Patch Changes

- c9176ea: Migrate auth middleware to router-scoped configuration and improve error resilience

  ### Details

  - Migrate `AuthModule` from `MiddlewareConfigurable` to `RouteConfigurable` interface
  - Add graceful error handling in session verification to prevent invalidated sessions from blocking requests
  - Expand Better Auth error mapping for token expiry, signup, and session creation failures
  - Use duck-typing for Better Auth `APIError` detection to handle bundler environments

- Updated dependencies [fcb71c4]
- Updated dependencies [17f8675]
- Updated dependencies [c9176ea]
- Updated dependencies [c9176ea]
  - stratal@0.0.18

## 0.0.17

### Patch Changes

- [`cbfce8b`](https://github.com/strataljs/stratal/commit/cbfce8b3a3517b60d94f500c5dc1ef68d8ee76f4) Thanks [@adesege](https://github.com/adesege)! - Export database CLI commands from `@stratal/framework/database`

  ### Details

  - Export `ZenStackCommand`, `DbGenerateCommand`, `DbPullCommand`, `DbPushCommand`, `MigrateDeployCommand`, `MigrateDevCommand`, `MigrateResetCommand`, and `MigrateStatusCommand`

- [#147](https://github.com/strataljs/stratal/pull/147) [`7f2772b`](https://github.com/strataljs/stratal/commit/7f2772ba90a9b6a91603f79293d384e972864125) Thanks [@adesege](https://github.com/adesege)! - Fix database event types to correctly resolve models and operation args across multiple schema connections using distributive conditional types

- Updated dependencies [[`7f2772b`](https://github.com/strataljs/stratal/commit/7f2772ba90a9b6a91603f79293d384e972864125), [`6cccfef`](https://github.com/strataljs/stratal/commit/6cccfefdde703c5c6eaba199d05307ab9fe36085), [`79e05de`](https://github.com/strataljs/stratal/commit/79e05de7482c925323a2f37a00e47929133a979f), [`3c89c14`](https://github.com/strataljs/stratal/commit/3c89c147fca366382c0771bb442f29a6fc73601e), [`916fd90`](https://github.com/strataljs/stratal/commit/916fd90727a06b5ce7c0397467fe9dc1f859f841), [`cbfce8b`](https://github.com/strataljs/stratal/commit/cbfce8b3a3517b60d94f500c5dc1ef68d8ee76f4)]:
  - stratal@0.0.17

## 0.0.16

### Patch Changes

- [#142](https://github.com/strataljs/stratal/pull/142) [`4b958e2`](https://github.com/strataljs/stratal/commit/4b958e250c99681a99a34a398fbf706546f556cc) Thanks [@adesege](https://github.com/adesege)! - Move auth, database, RBAC, and factory dependencies from optional peer dependencies to hard dependencies

  ### Details

  - `@better-auth/core`, `better-auth`, `@faker-js/faker`, `@zenstackhq/cli`, `@zenstackhq/orm`, and `casbin` are now direct dependencies
  - Remove `peerDependenciesMeta` optional markers for these packages

- Updated dependencies [[`3dd0bc8`](https://github.com/strataljs/stratal/commit/3dd0bc84c8638db30db7b70f3532a44aa187ace8), [`4b958e2`](https://github.com/strataljs/stratal/commit/4b958e250c99681a99a34a398fbf706546f556cc)]:
  - stratal@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies [[`0731e99`](https://github.com/strataljs/stratal/commit/0731e99c3e0c96f988387611f0ef8559b63d7bd8), [`52f1daa`](https://github.com/strataljs/stratal/commit/52f1daa981f5a38b983bb3c14abfefb663eb6941)]:
  - stratal@0.0.15

## 0.0.14

### Patch Changes

- [#124](https://github.com/strataljs/stratal/pull/124) [`59251d3`](https://github.com/strataljs/stratal/commit/59251d32743cbd461f952985f192a68cb7ccdb91) Thanks [@adesege](https://github.com/adesege)! - Remove unused `custom-pg-types` re-export from database module

- [#122](https://github.com/strataljs/stratal/pull/122) [`47530bd`](https://github.com/strataljs/stratal/commit/47530bd31bc91329788b4ba7b03a389f0e722f46) Thanks [@adesege](https://github.com/adesege)! - Migrate build system from tsc to tsdown for faster builds and code-splitting support

- Updated dependencies [[`59251d3`](https://github.com/strataljs/stratal/commit/59251d32743cbd461f952985f192a68cb7ccdb91), [`47530bd`](https://github.com/strataljs/stratal/commit/47530bd31bc91329788b4ba7b03a389f0e722f46)]:
  - stratal@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`8d0df50`](https://github.com/strataljs/stratal/commit/8d0df506411bc725ef4e4eaf4efdb314b3384d98), [`527f675`](https://github.com/strataljs/stratal/commit/527f675ea3b4cdb98165cbe1f81e820fa9e79490), [`bb99119`](https://github.com/strataljs/stratal/commit/bb991196dbcc55963d16ee1a6f5db580c18c796a), [`957de6e`](https://github.com/strataljs/stratal/commit/957de6e88684344bf26e95d03187345bf77f4f52), [`0ade941`](https://github.com/strataljs/stratal/commit/0ade94162f9058e9230039fa72efbbf3e57cf572)]:
  - stratal@0.0.13

## 0.0.12

### Patch Changes

- [#97](https://github.com/strataljs/stratal/pull/97) [`d58b878`](https://github.com/strataljs/stratal/commit/d58b8782848562a50b79cd558eaf01978aa77f26) Thanks [@adesege](https://github.com/adesege)! - Add `stratalTest()` vitest plugin and migrate fetch mocking from Cloudflare's undici-based `fetchMock` to MSW

  ### Details

  - **@stratal/testing**

    - Add `@stratal/testing/vitest-plugin` sub-export with `stratalTest()` — wraps `cloudflareTest` with Stratal defaults (tslib alias, ZenStack mocks, SSR externals)
    - Replace `FetchMock`/`createFetchMock` with `MockFetch`/`createMockFetch` backed by MSW (`setupServer`)
    - Re-export `http` and `HttpResponse` from `msw` for convenience
    - Update `cloudflare:test` imports to `cloudflare:workers`
    - Bump vitest peer dependency from `^3.2.0` to `^4.1.0`

  - **stratal**

    - Update test mocks to use class syntax for Vitest 4 compatibility
    - Bump dependencies: `@intlify/*`, `@scalar/hono-api-reference`, `hono`, `@aws-sdk/*`, `vitest`

  - **@stratal/framework**
    - Refactor vitest config to use `stratalTest()` plugin, removing manual pool/alias config
    - Bump dependencies: `better-auth`, `@zenstackhq/*`, `wrangler`, `vitest`

  ### Breaking Changes

  - **@stratal/testing**: `FetchMock` and `createFetchMock` are removed. Use `MockFetch`/`createMockFetch` instead. The new API uses MSW lifecycle methods (`listen`/`reset`/`close`) instead of `activate`/`disableNetConnect`/`deactivate`.
  - **@stratal/testing**: Vitest peer dependency is now `^4.1.0` (was `^3.2.0`).

- Updated dependencies [[`11b0da9`](https://github.com/strataljs/stratal/commit/11b0da97ef436bffef592fbc34685bbcc85d7ef7), [`e1a2ba2`](https://github.com/strataljs/stratal/commit/e1a2ba2da883481d192a15b8015456705982d683), [`d58b878`](https://github.com/strataljs/stratal/commit/d58b8782848562a50b79cd558eaf01978aa77f26)]:
  - stratal@0.0.12

## 0.0.11

### Patch Changes

- [#90](https://github.com/strataljs/stratal/pull/90) [`87581af`](https://github.com/strataljs/stratal/commit/87581af263eb74c059966650fbd5c1b849d36dfc) Thanks [@adesege](https://github.com/adesege)! - Refactor database module to use per-connection schemas instead of a shared schema with slicing

  ### Breaking Changes

  **@stratal/framework**

  - `DatabaseModuleConfig` no longer accepts a top-level `schema` property. Each connection in `connections` now requires its own `schema` property.
  - `DatabaseConnectionConfig` no longer accepts `slicing`. Each connection defines its own schema, making slicing unnecessary.
  - `StratalDatabase` augmentation interface changed: replace `schema` and `slicing` with `schemas` (a map of connection name to schema type).

    ```typescript
    // Before
    interface StratalDatabase {
      schema: SchemaType;
      defaultConnection: "main";
      slicing: {
        main: { includedModels: readonly ["User", "Post"] };
        analytics: { includedModels: readonly ["AnalyticsEvent"] };
      };
    }

    // After
    interface StratalDatabase {
      schemas: {
        main: MainSchemaType;
        analytics: AnalyticsSchemaType;
      };
      defaultConnection: "main";
    }
    ```

  - Removed type exports: `InferDatabaseSchema`, `InferConnectionSlicing`
  - Added type exports: `InferConnectionSchema<K>`, `InferAnySchema`
  - Removed `@stratal/zenstack-plugin` package (no longer needed with per-connection schemas)
  - Removed `slicing` support from database connections. Slicing will be re-added in a future release.

- [#92](https://github.com/strataljs/stratal/pull/92) [`bae01ef`](https://github.com/strataljs/stratal/commit/bae01eff7cb7f520ad00206377d9f5f4968076b6) Thanks [@adesege](https://github.com/adesege)! - Update symbol tokens to use 'stratal' namespace for consistency across modules

- Updated dependencies [[`bae01ef`](https://github.com/strataljs/stratal/commit/bae01eff7cb7f520ad00206377d9f5f4968076b6)]:
  - stratal@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies [[`3329d20`](https://github.com/strataljs/stratal/commit/3329d20658ea6a6f7cadbbb3efb7630b1cca9ad2)]:
  - stratal@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies [[`c0d9313`](https://github.com/strataljs/stratal/commit/c0d9313b30272eece8a4596718b7d4c1b442c221)]:
  - stratal@0.0.9

## 0.0.8

### Patch Changes

- [#84](https://github.com/strataljs/stratal/pull/84) [`3b38b81`](https://github.com/strataljs/stratal/commit/3b38b8184428dc0f79ffbe9dc55ba782d46dea03) Thanks [@adesege](https://github.com/adesege)! - Rename `AuthModule.withRootAsync` to `AuthModule.forRootAsync` for consistency with core framework naming conventions

  ### Breaking Changes

  - **@stratal/framework**: `AuthModule.withRootAsync()` has been renamed to `AuthModule.forRootAsync()`. Update all usages:
    ```diff
    - AuthModule.withRootAsync({ ... })
    + AuthModule.forRootAsync({ ... })
    ```

- Updated dependencies []:
  - stratal@0.0.8

## 0.0.7

### Patch Changes

- [#81](https://github.com/strataljs/stratal/pull/81) [`89e06b5`](https://github.com/strataljs/stratal/commit/89e06b57f8aca553f60cbefab8f931cf5554f1b3) Thanks [@adesege](https://github.com/adesege)! - Rearchitect core internals: replace AsyncLocalStorage-based request context with explicit container passing, and replace RouterService with HonoApp

  ### Breaking Changes

  **`stratal` (core)**

  - **Removed `RequestContextStore`** — The `AsyncLocalStorage`-based request context propagation is eliminated. This removes the dependency on the `nodejs_als` compatibility flag in Cloudflare Workers.
  - **Removed `RouterService` and `RequestScopeService`** — Replaced by `HonoApp`, a subclass of `OpenAPIHono` that directly integrates request scoping, middleware class support, and global error handling.
  - **Removed `RouterAlreadyConfiguredError` and `RouterNotConfiguredError`** — Replaced by `HonoAppAlreadyConfiguredError`.
  - **`Container` no longer accepts `env` or `ctx` in options** — These are now registered as values in the container by `Application` directly.
  - **`runInRequestScope()` callback signature changed** — The callback now receives `(requestContainer: Container) => T | Promise<T>` instead of `() => T | Promise<T>`. Callers must use the passed container for resolution.
  - **`Stratal` initialization changed from lazy to eager** — `Stratal` now eagerly bootstraps by dynamically importing `cloudflare:workers` for `env` and `waitUntil`, instead of lazily initializing on first request.
  - **`queue()` and `scheduled()` no longer accept `env` and `ctx` parameters** — These are obtained from `cloudflare:workers` during eager init.
  - **New `StratalExecutionContext` interface** — A minimal abstraction over Cloudflare's `ExecutionContext` with only `waitUntil()`.
  - **New `HonoApp` class** — Extends `OpenAPIHono` with Stratal concerns; supports `Constructor<Middleware>` in `use()` via module augmentation.

  **`@stratal/framework`**

  - **`DatabaseConnectionConfig.dialect` changed from `Dialect` to `() => Dialect`** — Database connections now take a factory function for lazy dialect/pool creation.
  - **Caching strategy changed from `instancePerContainerCachingFactory` to `instanceCachingFactory`**.

  **`@stratal/testing`**

  - **`TestingModule.runInRequestScope()` callback now receives a `container` parameter** — Update all callbacks to use the passed container for service resolution.
  - **`TestingModule.fetch()` now routes through `HonoApp`** instead of `RouterService`.
  - **`TestingModuleBuilder.compile()` now applies overrides before `initialize()`** — Fixes issue where overrides were applied after initialization.

  ### Minor Changes

  **`@stratal/seeders`**

  - Updated `executeSeeder()` to use the explicit `requestContainer` parameter from `runInRequestScope()`.

- [#83](https://github.com/strataljs/stratal/pull/83) [`bcb3556`](https://github.com/strataljs/stratal/commit/bcb3556a6e1f185e088286f202c605c73799e63f) Thanks [@adesege](https://github.com/adesege)! - Introduce @stratal/zenstack-plugin and rearchitect database module to use shared schema with per-connection slicing

  ### New Package

  **`@stratal/zenstack-plugin`**

  - ZenStack plugin for multi-connection database support with schema slicing
  - Generates connection-specific schema types and `StratalDatabase` augmentation
  - CLI commands: `stratal-db migrate` and `stratal-db push` for per-connection database management
  - Plugin model (`plugin.zmodel`) for ZenStack integration

  ### Breaking Changes

  **`stratal` (core)**

  - Re-exports `delay` from tsyringe via `stratal/di`

  **`@stratal/framework`**

  - **Replaced `DatabaseSchemaRegistry` and `DefaultDatabaseConnection` with unified `StratalDatabase` interface** — Consumers must update their type augmentations to use the new single interface with `schema`, `defaultConnection`, and `slicing` properties.
  - **`schema` moved from `DatabaseConnectionConfig` to `DatabaseModuleConfig`** — All connections now share a single schema; per-connection schema is no longer supported.
  - **Added `slicing` option to `DatabaseConnectionConfig`** — Connections can narrow available models via ZenStack slicing options.
  - **Database services are now lazily created** — Dialect factories are not called during module initialization; services are instantiated on first resolve within a request scope.
  - **Database services are now request-scoped** — Each request gets its own database client instance via tsyringe's `delay()` + `Scope.Request`.
  - **`DatabaseEvents` type no longer parameterized by connection** — Event types (`ModelName`, `DatabaseEventName`, `GetData`, `GetResult`, etc.) derive from the shared schema instead of per-connection schemas.
  - **Removed `InferConnectionSchema` type** — Replaced by `InferDatabaseSchema` (shared) and `InferConnectionSlicing` (per-connection slicing).

  **`@stratal/testing`**

  - **`TestingModule.getDb()` is now synchronous** — Returns `DatabaseService` directly instead of `Promise<DatabaseService>`.
  - **`TestingModule` creates a single request-scoped container at construction** — `container` property now returns the request-scoped container. The `runInRequestScope` pattern is removed.
  - **`TestingModule.close()` now disposes the request container** before shutting down the application.

- Updated dependencies [[`89e06b5`](https://github.com/strataljs/stratal/commit/89e06b57f8aca553f60cbefab8f931cf5554f1b3), [`bcb3556`](https://github.com/strataljs/stratal/commit/bcb3556a6e1f185e088286f202c605c73799e63f)]:
  - stratal@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies [[`6542f78`](https://github.com/strataljs/stratal/commit/6542f78fda2bf851df7ee5d88d6f7c7d04ea6388)]:
  - stratal@0.0.6

## 0.0.5

### Patch Changes

- [#66](https://github.com/strataljs/stratal/pull/66) [`c8ea964`](https://github.com/strataljs/stratal/commit/c8ea964e272b09ebc6619843e77d2b51178f9423) Thanks [@adesege](https://github.com/adesege)! - Add AuthModule (Better Auth integration), DatabaseModule (ZenStack ORM with named connections and plugins), RbacModule (Casbin RBAC), AuthGuard factory, AuthContext, Factory base class, and database event types. Includes E2E test suite with Docker Postgres.

- Updated dependencies [[`c8ea964`](https://github.com/strataljs/stratal/commit/c8ea964e272b09ebc6619843e77d2b51178f9423)]:
  - stratal@0.0.5
