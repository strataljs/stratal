---
"@stratal/testing": patch
"stratal": patch
"@stratal/framework": patch
---

Add `stratalTest()` vitest plugin and migrate fetch mocking from Cloudflare's undici-based `fetchMock` to MSW

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
