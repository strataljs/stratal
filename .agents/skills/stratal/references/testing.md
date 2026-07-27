# Testing

## Setup

### Vitest Plugin

```typescript
// vitest.config.ts
import { fixNobleHashesCjs, fixPgCjs, stratalTest } from '@stratal/testing/vitest-plugin'

export default defineConfig({
  plugins: [fixPgCjs(), fixNobleHashesCjs(), stratalTest()],
})
```

`stratalTest()` wraps `@cloudflare/vitest-pool-workers` with Stratal defaults (tslib alias, ZenStack mocks, SSR externals). It needs no database — `Test.createTestingModule()` and unit tests run with no DB wiring at all. A database is opt-in via the `database` option (below).

Add `fixPgCjs()` and `fixNobleHashesCjs()` when the project uses `@stratal/framework` (ZenStack). Both are no-ops if the relevant packages aren't installed.

### Parallel tests with a database per test file

Opt in by passing a `database` option to `stratalTest()`, which gives **each test file its own database**, cloned from a migrated template. This automatically enables file parallelism and raises the setup hook timeout to 30s. An empty object is enough; within a file, reset state between tests via `truncateDb()`. Per-**file** (not per-worker) is deliberate — `@cloudflare/vitest-pool-workers` isolates per file and can run a worker's files concurrently, so a shared database would corrupt under load. Omit `database` entirely for suites that don't touch Postgres.

```typescript
// vitest.config.ts
import { fixNobleHashesCjs, fixPgCjs, stratalTest } from '@stratal/testing/vitest-plugin'
import { defineConfig } from 'vitest/config'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL is required to run e2e tests')

export default defineConfig({
  plugins: [fixPgCjs(), fixNobleHashesCjs()],
  test: {
    projects: [
      {
        plugins: [
          stratalTest({
            wrangler: { configPath: './test/wrangler.jsonc' },
            miniflare: { hyperdrives: { DB: DATABASE_URL } },
            database: {}, // opt in to per-file database isolation
          }),
        ],
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.spec.ts'],
          globalSetup: ['./test/global-setup.ts'],
        },
      },
    ],
  },
})
```

Wire `globalSetup` to build the migrated template with `createTestDatabaseGlobalSetup` from `@stratal/testing/database`. It reads `DATABASE_URL` and calls your `migrate` callback against the template's connection string:

```typescript
// test/global-setup.ts
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { createTestDatabaseGlobalSetup } from '@stratal/testing/database'

const schemaPath = resolve(import.meta.dirname, 'schema.zmodel')
const zenstackBin = resolve(import.meta.dirname, '../../../node_modules/.bin/zenstack')

export default createTestDatabaseGlobalSetup({
  schema: schemaPath, // required — file or directory; fingerprints the template
  migrate: (connectionString) => {
    execFileSync(zenstackBin, ['db', 'push', '--force-reset', `--schema=${schemaPath}`, '--accept-data-loss'], {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: connectionString },
    })
  },
})
```

Bake expensive baseline state (seed data, reference rows, a default tenant schema) into the template with the optional `prepare` hook — it runs once, after `migrate`, so every worker database inherits it via the clone instead of rebuilding it per test:

```typescript
export default createTestDatabaseGlobalSetup({
  schema: schemaPath,
  migrate: (connectionString) => { /* ...as above... */ },
  prepare: async (connectionString) => {
    // v1 — bump this comment when seed data changes (see note below)
    await seedReferenceData(connectionString)
  },
})
```

Notes:
- Run tests with `npx dotenv -- vitest run` so `.env`'s `DATABASE_URL` reaches `vitest.config.ts` and `globalSetup`.
- **`schema` is required** (a file or directory path, or a list). Its contents plus the `migrate` and `prepare` routines are hashed into a fingerprint stored as the template database's COMMENT. The template is **reused across runs while the fingerprint is unchanged** and rebuilt only when it changes — so `migrate`/`prepare` run only on the first run after an edit (or against a fresh database). Reuse is purely fingerprint-driven; there is no force/skip flag. For a ZenStack **multi-file schema, pass the root `.zmodel`** — its `import` graph is followed, so editing any imported file forces a rebuild (a directory path hashes every schema file in its tree).
- **`prepare` fingerprints its source text only.** If it reads external seed files (JSON/SQL) at runtime, changing only those files will NOT invalidate the template — bump the hook's source (e.g. a version comment) or drop the template manually.
- The binding defaults to `DB`. For a differently-named Hyperdrive binding, set `database: { binding: 'MY_DB' }` (typed to your declared Hyperdrive bindings).
- Requires Postgres and the `pg` package (an optional peer of `@stratal/testing`). If the `database` option is set without `pg` installed, setup throws an actionable "install pg" error.
- **Concurrency-safe.** The fingerprint check + template rebuild runs under a Postgres advisory lock, so multiple concurrent setups (CI sharding, several e2e projects) don't clobber each other. Per-file database clones are likewise serialized by an advisory lock (only one `CREATE DATABASE ... TEMPLATE` at a time). The setup-time stale-database sweep only drops per-file databases with **no active connections**, so a sibling process's live databases survive. Teardown is intentionally non-destructive (it neither sweeps nor drops the template); the next run's sweep reclaims any leak.
- The base database name must be short enough that the per-file suffix (`<base>_f_<token>`) and the template name (`<base>_template`) fit within Postgres' 63-character identifier limit. Setup throws a clear error if it doesn't, rather than silently truncating and colliding names.
- Heavier per-file setup (e.g. provisioning a tenant schema in `beforeAll`) can exceed the 30s hook-timeout floor — raise it per project with `test: { hookTimeout: 60000 }`.

### Setup File

```typescript
// vitest.setup.ts
```

### Test File Convention

```
src/**/__tests__/**/*.spec.ts
```

## TestingModule

### Creating a Test Module

```typescript
import { Test } from '@stratal/testing'

describe('NotesController', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [NotesModule],
      providers: [/* additional providers */],
    }).compile()
  })

  afterAll(async () => {
    await module.close()
  })
})
```

### Configuration Options

```typescript
Test.createTestingModule({
  imports: [],       // Module imports
  providers: [],     // Additional providers
  controllers: [],   // Additional controllers
  consumers: [],     // Queue consumers
  jobs: [],          // Cron jobs
  env: {},           // Environment variable overrides
  logging: {         // Logging config
    level: LogLevel.ERROR,
    formatter: 'json',
  },
  cache: false,      // Opt out of the default ctx.cache stub (see Response Cache below)
})
```

### Provider Overrides

```typescript
const module = await Test.createTestingModule({
  imports: [NotesModule],
})
  .overrideProvider(NOTES_TOKENS.Repository)
  .useValue(mockRepository)
  .compile()
```

### Environment Overrides

```typescript
const module = await Test.createTestingModule({
  imports: [NotesModule],
})
  .withEnv({ API_KEY: 'test-key' })
  .compile()
```

## TestHttpClient

Fluent HTTP client for making test requests.

### Basic Requests

```typescript
// GET
const response = await module.http
  .get('/api/v1/notes')
  .send()

// POST with body
const response = await module.http
  .post('/api/v1/notes')
  .withBody({ title: 'Test', content: 'Hello' })
  .send()

// PUT with body
const response = await module.http
  .put('/api/v1/notes/123')
  .withBody({ title: 'Updated' })
  .send()

// DELETE
const response = await module.http
  .delete('/api/v1/notes/123')
  .send()
```

### Request Configuration

```typescript
const response = await module.http
  .forHost('example.com')                     // Set host
  .withHeaders({ 'X-Custom': 'value' })       // Set headers
  .post('/api/v1/notes')
  .withBody({ title: 'Test' })
  .withHeader('Authorization', 'Bearer token') // Per-request header
  .send()
```

### Locale Testing

Set the locale for requests. The strategy auto-resolves from your `I18nModule.forRoot()` detection config, or can be overridden:

```typescript
// Sets locale for all requests from this client
const response = await module.http
  .withLocale('fr')
  .get('/api/v1/notes')
  .send()

// Sets locale for a single request
const response = await module.http
  .get('/api/v1/notes')
  .withLocale('fr')
  .send()

// Override strategy for a specific request
const response = await module.http
  .get('/api/v1/notes')
  .withLocale('fr', 'header')
  .send()
```

`withLocale(locale, strategy?)` is available on `TestHttpClient`, `TestHttpRequest`, `TestSseRequest`, and `TestWsRequest`.

Strategy determines how the locale is applied:
- `'cookie'` — sets `Cookie: locale=fr`
- `'header'` — sets `Accept-Language: fr`
- `'querystring'` — appends `?locale=fr` to the URL
- `'path'` — use the URL path directly (e.g., `/fr/api/v1/notes`)

### Authenticated Requests

```typescript
// actingAs creates a session for the user
const response = await module.http
  .get('/api/v1/profile')
  .actingAs({ id: user.id })
  .send()

response.assertOk()
```

### Response Assertions

```typescript
const response = await module.http.get('/api/v1/notes').send()

// Status assertions
response.assertOk()              // 200
response.assertCreated()         // 201
response.assertNoContent()       // 204
response.assertBadRequest()      // 400
response.assertUnauthorized()    // 401
response.assertForbidden()       // 403
response.assertNotFound()        // 404
response.assertUnprocessable()   // 422
response.assertServerError()     // 500
response.assertStatus(418)       // Custom status
response.assertSuccessful()      // 2xx range

// JSON assertions
await response.assertJson({ key: 'value' })
await response.assertJsonPath('data.name', 'Test')
await response.assertJsonStructure(['id', 'name', 'email'])
await response.assertJsonPathExists('data.id')
await response.assertJsonPathMissing('data.password')
await response.assertJsonPathCount('data.items', 5)

// Header assertions
response.assertHeader('content-type', 'application/json')
response.assertHeaderMissing('x-debug')

// Get response data
const data = await response.json()
const text = await response.text()
```

## Resolving Services

`TestingModule` auto-creates a request scope in its constructor. `get()` resolves from the request-scoped container:

```typescript
const service = module.get<NotesService>(NOTES_TOKENS.NotesService)
```

## Database Utilities

```typescript
// Truncate mutable tables in the current schema (migration bookkeeping is always kept)
await module.truncateDb()

// Truncate across extra schemas and preserve reference/seed tables
await module.truncateDb('DB', {
  schemas: ['analytics'],           // beyond current_schema()
  preserve: ['countries', 'roles'], // table names or LIKE patterns to keep
})

// Run a seeder
await module.seed(NotesSeeder)

// Assert a record exists
await module.assertDatabaseHas('note', { title: 'Test' })

// Assert a record does not exist
await module.assertDatabaseMissing('note', { title: 'Deleted' })
```

With per-file `database` isolation (see Setup), each test file owns its own database cloned from the migrated template. Call `truncateDb()` in a `beforeEach`/`afterEach` to reset rows between tests within the file. Anything baked into the template via `prepare` should be listed in `preserve` so a reset keeps it.

## MockFetch (MSW)

For mocking external HTTP requests using Mock Service Worker:

```typescript
import { createMockFetch, MockFetch } from '@stratal/testing'
import { http, HttpResponse } from '@stratal/testing'

describe('ExternalApiService', () => {
  let mockFetch: MockFetch

  beforeAll(() => {
    mockFetch = createMockFetch([
      http.get('https://api.example.com/data', () => {
        return HttpResponse.json({ result: 'mocked' })
      }),
    ])
    mockFetch.listen()
  })

  afterEach(() => mockFetch.reset())
  afterAll(() => mockFetch.close())
})
```

### MockFetch Lifecycle

```typescript
mockFetch.listen()  // Start intercepting
mockFetch.reset()   // Clear handlers (between tests)
mockFetch.close()   // Stop intercepting
```

### Adding Handlers Dynamically

```typescript
mockFetch.use(
  http.post('https://api.example.com/submit', () => {
    return HttpResponse.json({ success: true }, { status: 201 })
  }),
)
```

## Factory (Framework)

Abstract base class for test data factories from `@stratal/framework/factory`:

```typescript
import { Factory } from '@stratal/framework/factory'

export class UserFactory extends Factory<User, CreateUserInput> {
  protected model = 'user'

  protected definition(): CreateUserInput {
    return {
      name: this.faker.person.fullName(),
      email: this.faker.internet.email(),
    }
  }

  admin() {
    return this.state((attrs) => ({ ...attrs, role: 'admin' }))
  }
}

// Usage
const factory = new UserFactory()
const input = factory.make()                          // Create input data
const inputs = factory.makeMany(5)                    // Create 5 inputs
const user = await factory.create(db)                 // Persist to database
const admin = await factory.admin().create(db)        // With state modifier
const users = await factory.count(10).createManyAndReturn(db) // Batch create
```

## Fake Storage

```typescript
// Access fake storage service
const storage = module.storage

// Assert files were stored
expect(storage.files).toContainEqual(
  expect.objectContaining({ key: 'uploads/file.txt' })
)
```

## Response Cache

A `ctx.cache` stub is installed by default, so `@Cacheable`/`@PurgesCache` routes are testable with no configuration — neither Miniflare nor workerd populates `ExecutionContext.cache` on its own, and without the stub any app with a cache-decorated route would 500 on its first request.

```typescript
const response = await module.http.get('/blog/hello-world').send()
response.assertOk()
response.assertHeader('Cache-Control', 'public, max-age=300')

await module.http.post('/posts/hello-world/publish').send()
expect(module.cache.purges).toEqual([{ tags: ['post:hello-world'] }])
```

Pass `cache: false` to `Test.createTestingModule()` to reproduce a runtime where Workers Caching is genuinely unconfigured (e.g. to test the `ResponseCacheConfigError` boot guard). See `references/response-cache.md` for the full testing story.

## Command Testing

```typescript
const result = await module
  .quarry('users:create')
  .withInput({ email: 'test@example.com', admin: true })
  .run()

result.assertSuccessful()
result.assertOutputContains('User created')
result.assertExitCode(0)
```

## WebSocket Testing

```typescript
const ws = await module.ws('/ws/chat')
  .actingAs({ id: user.id })
  .connect()

ws.send('hello')
await ws.assertMessage('echo:hello')
ws.close()
await ws.waitForClose()

// With locale
const ws = await module.ws('/ws/chat')
  .withLocale('fr')
  .connect()
```

## SSE Testing

```typescript
const sse = await module.sse('/streaming/events')
  .actingAs({ id: user.id })
  .connect()

await sse.assertEvent({ event: 'message', data: 'hello' })
await sse.waitForEnd()

// With locale
const sse = await module.sse('/streaming/events')
  .withLocale('fr')
  .connect()
```

## Inertia Testing

Inertia assertions augment `TestResponse` with methods for verifying Inertia page responses. Import from `@stratal/inertia/testing` in your test setup to activate them.

### Setup

Add the side-effect import to your test setup file:

```typescript
// vitest.setup.ts
import '@stratal/inertia/testing'  // Augments TestResponse with Inertia assertions
```

### Assertions

All Inertia assertions are chainable (return `Promise<this>`). They require the response to be an Inertia JSON page response (`X-Inertia: true` header, 200 status).

```typescript
const response = await module.http
  .get('/notes')
  .withHeader('X-Inertia', 'true')
  .withHeader('X-Inertia-Version', '1')
  .send()

// Assert response is Inertia (checks X-Inertia header + 200 status)
await response.assertInertia()

// Assert with callback for custom assertions on the page object
await response.assertInertia((page) => {
  expect(page.component).toBe('notes/Index')
  expect(page.props.notes).toHaveLength(3)
})

// Assert component name
await response.assertInertiaComponent('notes/Index')

// Assert prop value at dot-path
await response.assertInertiaProp('notes.0.title', 'My Note')

// Assert prop existence
await response.assertInertiaPropExists('notes')
await response.assertInertiaPropMissing('secret')

// Assert page URL and version
await response.assertInertiaUrl('/notes')
await response.assertInertiaVersion('1')

// Assert flash data
await response.assertInertiaFlash('success', 'Note created')

// Assert deferred props (prop name + group name)
await response.assertInertiaDeferredProp('stats', 'default')

// Assert merge props
await response.assertInertiaMergeProp('notifications')

// Assert shared props
await response.assertInertiaSharedProp('appName')
```

### Assertion Reference

| Method | Description |
|--------|-------------|
| `assertInertia(callback?)` | Assert response is Inertia. Optional callback receives the page object. |
| `assertInertiaComponent(component)` | Assert `page.component` matches exactly. |
| `assertInertiaProp(path, expected)` | Assert prop at dot-path deep-equals expected value. |
| `assertInertiaPropExists(path)` | Assert prop at dot-path exists. |
| `assertInertiaPropMissing(path)` | Assert prop at dot-path does not exist. |
| `assertInertiaUrl(url)` | Assert `page.url` matches exactly. |
| `assertInertiaVersion(version)` | Assert `page.version` matches (string or null). |
| `assertInertiaFlash(key, value)` | Assert `page.flash[key]` deep-equals value. |
| `assertInertiaDeferredProp(prop, group)` | Assert prop is in `page.deferredProps[group]`. |
| `assertInertiaMergeProp(prop)` | Assert prop is in `page.mergeProps`. |
| `assertInertiaSharedProp(prop)` | Assert prop is in `page.sharedProps`. |
| `assertSuccessfulPrecognition()` | Assert 204 response with `Precognition` and `Precognition-Success` headers. |
| `assertPrecognitionValidationErrors(errors?)` | Assert 422 with `Precognition` header. Optionally assert error body. |
