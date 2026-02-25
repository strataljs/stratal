# 03 - Testing

Testing a Stratal application using `@stratal/testing` with Vitest and Cloudflare's worker pool.

## What it demonstrates

- `Test.createTestingModule()` for bootstrapping a test module
- `module.http` for making HTTP requests against the application
- Fluent assertion API: `assertCreated()`, `assertOk()`, `assertJsonPath()`, etc.
- `module.get()` for resolving services from the DI container
- `module.close()` for cleanup

## Running

```bash
cd examples/03-testing
npx vitest run
```

## Key files

- [`src/notes/__tests__/notes.spec.ts`](src/notes/__tests__/notes.spec.ts) - Test suite
- [`vitest.config.ts`](vitest.config.ts) - Vitest configuration with Cloudflare worker pool
