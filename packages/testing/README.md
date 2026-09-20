# @stratal/testing

Testing utilities and mocks for [Stratal](https://stratal.dev) applications.

[![npm version](https://img.shields.io/npm/v/@stratal/testing)](https://www.npmjs.com/package/@stratal/testing)
[![CI](https://github.com/strataljs/stratal/actions/workflows/ci.yml/badge.svg)](https://github.com/strataljs/stratal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![npm downloads](https://img.shields.io/npm/dm/@stratal/testing)](https://www.npmjs.com/package/@stratal/testing)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/strataljs/stratal/pulls)
[![GitHub stars](https://img.shields.io/github/stars/strataljs/stratal?style=social)](https://github.com/strataljs/stratal)

## Installation

```bash
npm install -D @stratal/testing
# or
yarn add -D @stratal/testing
```

### Peer dependencies

```bash
npm install -D stratal vitest
```

### AI Agent Skills

Stratal provides [Agent Skills](https://agentskills.io) for AI coding assistants like Claude Code and Cursor. Install to give your AI agent knowledge of Stratal patterns, conventions, and APIs:

```bash
npx skills add strataljs/stratal
```

| Skill | Description |
|---|---|
| `stratal` | Build Cloudflare Workers apps with the Stratal framework — modules, DI, controllers, routing, OpenAPI, queues, cron, events, seeders, CLI, auth, database, access control, testing, and more |

## Vitest setup

`stratalTest()` wraps [`@cloudflare/vitest-plugin`](https://developers.cloudflare.com/workers/testing/vitest-integration/) with Stratal defaults (tslib alias, ZenStack mocks, SSR externals). It needs no database — `Test.createTestingModule()` and unit tests run with no DB wiring at all.

```typescript
// vitest.config.ts
import { fixNobleHashesCjs, fixPgCjs, stratalTest } from '@stratal/testing/vitest-plugin'

export default defineConfig({
  plugins: [fixPgCjs(), fixNobleHashesCjs(), stratalTest()],
})
```

A database is opt-in via the `database` option, which gives **each test file** its own database cloned from a migrated template. Omit it entirely for suites that don't touch Postgres.

## Quick Start

Set up base modules once in your Vitest setup file, then create test modules in each test:

```typescript
// vitest.setup.ts
import { Test } from '@stratal/testing'
import { CoreModule } from './src/core.module'

Test.setBaseModules([CoreModule])
```

```typescript
// users/__tests__/users.spec.ts
import { Test, type TestingModule } from '@stratal/testing'
import { UsersModule } from '../users.module'

describe('UsersController', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [UsersModule],
    }).compile()
  })

  afterAll(async () => {
    await module.close()
  })

  it('lists users', async () => {
    const response = await module.http
      .get('/api/users')
      .send()

    response.assertOk()
  })
})
```

## Core API

### `Test`

Static entry point for creating testing modules.

```typescript
import { Test } from '@stratal/testing'

// Set once in vitest.setup.ts — included in every test module
Test.setBaseModules([CoreModule])

// Create a test module in each test file
const builder = Test.createTestingModule({
  imports: [UsersModule, AuthModule],
  providers: [{ provide: MOCK_TOKEN, useValue: mockValue }],
  controllers: [TestController],
  env: { DATABASE_URL: 'test://db' },
})
```

### `TestingModuleBuilder`

Fluent builder returned by `Test.createTestingModule()`. Chain provider overrides, then call `.compile()`.

```typescript
const module = await Test.createTestingModule({
  imports: [OrdersModule],
})
  .overrideProvider(PAYMENT_TOKEN)
  .useValue(mockPaymentService)
  .withEnv({ STRIPE_KEY: 'sk_test_xxx' })
  .compile()
```

### `TestingModule`

The compiled test context. Provides access to services, HTTP client, storage, and lifecycle management.

```typescript
// Resolve services from the DI container
const service = module.get(ORDER_TOKENS.OrderService)

// Access the HTTP test client
module.http

// Access fake storage for assertions
module.storage

// Other test clients and fakes
module.ws('/ws/chat')          // WebSocket request builder
module.sse('/streaming/events') // Server-sent events request builder
module.quarry('users:create')   // Quarry command request builder
module.cache                    // Workers Cache stub — inspect purges
module.featureFlags             // Fake feature flag service
module.sentEmails               // Emails sent during the test

// Execute code in a request-scoped container
await module.runInRequestScope(async (container) => {
  const scoped = container.resolve(REQUEST_SCOPED_TOKEN)
})

// Cleanup in afterAll
await module.close()
```

## HTTP Testing

The built-in HTTP client provides a fluent API for making requests and asserting responses.

### Making requests

```typescript
const response = await module.http
  .forHost('api.example.com')  // optional — defaults to localhost
  .post('/api/v1/orders')
  .withHeaders({ Authorization: 'Bearer token' })
  .withBody({ item: 'Widget', qty: 3 })
  .send()
```

All HTTP methods are supported: `.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`.

Requests can also act as a user, force JSON, or carry a locale:

```typescript
await module.http.get('/api/v1/profile').actingAs({ id: user.id }).send()
await module.http.get('/api/v1/notes').asJson().send()
await module.http.get('/api/v1/notes').withLocale('fr').send()
```

### Response assertions

```typescript
response
  .assertCreated()               // 201
  .assertHeader('Content-Type', 'application/json')

// Status helpers
response.assertOk()              // 200
response.assertNoContent()       // 204
response.assertBadRequest()      // 400
response.assertUnauthorized()    // 401
response.assertForbidden()       // 403
response.assertNotFound()        // 404
response.assertUnprocessable()   // 422
response.assertServerError()     // 500
response.assertStatus(418)       // any status
response.assertSuccessful()      // 2xx range

// JSON assertions (async — chainable with await)
await response.assertJson({ success: true })
await response.assertJsonPath('data.user.id', expect.any(String))
await response.assertJsonPaths({ 'data.name': 'Alice', 'data.role': 'admin' })
await response.assertJsonStructure(['id', 'name', 'email'])
await response.assertJsonPathExists('data.createdAt')
await response.assertJsonPathMissing('data.password')
await response.assertJsonPathCount('data.items', 3)
await response.assertJsonPathContains('data.bio', 'engineer')
await response.assertJsonPathIncludes('data.tags', 'featured')

// Header assertions
response.assertHeader('X-Request-Id')        // exists
response.assertHeader('X-Request-Id', '123') // exact value
response.assertHeaderMissing('X-Debug')

// Raw access
const json = await response.json<OrderResponse>()
const text = await response.text()
response.status   // number
response.headers  // Headers
response.raw      // underlying Response
```

## Provider Overrides

Replace any provider in the DI container for testing:

```typescript
const module = await Test.createTestingModule({
  imports: [NotificationModule],
})
  // Static value
  .overrideProvider(EMAIL_TOKEN)
  .useValue(mockEmailService)

  // Class replacement
  .overrideProvider(LOGGER_TOKEN)
  .useClass(SilentLogger)

  // Factory with container access
  .overrideProvider(CACHE_TOKEN)
  .useFactory((container) => new InMemoryCache(container.resolve(CONFIG_TOKEN)))

  // Alias to existing token
  .overrideProvider(PAYMENT_TOKEN)
  .useExisting(MOCK_PAYMENT_TOKEN)

  .compile()
```

## Fetch Mocking

Mock external HTTP calls with `createMockFetch()`, backed by [Mock Service Worker](https://mswjs.io). `http` and `HttpResponse` are re-exported for convenience.

```typescript
import { createMockFetch, http, HttpResponse, type MockFetch } from '@stratal/testing'

describe('GeoService', () => {
  let mockFetch: MockFetch

  beforeAll(() => {
    mockFetch = createMockFetch([
      http.get('https://geo.api.com/lookup', () => {
        return HttpResponse.json({ lat: 40.7128, lng: -74.006 })
      }),
    ])
    mockFetch.listen()
  })

  afterEach(() => mockFetch.reset())
  afterAll(() => mockFetch.close())

  it('looks up coordinates', async () => {
    const response = await module.http
      .get('/api/geo/lookup?address=NYC')
      .send()

    response.assertOk()
    await response.assertJsonPath('data.lat', 40.7128)
  })
})
```

### Lifecycle

```typescript
mockFetch.listen()  // start intercepting
mockFetch.reset()   // clear runtime handlers, between tests
mockFetch.close()   // stop intercepting
```

### Adding handlers for a single test

```typescript
mockFetch.use(
  http.post('https://geo.api.com/submit', () => {
    return HttpResponse.json({ success: true }, { status: 201 })
  }),
)
```

### Shorthands

```typescript
mockFetch.mockJsonResponse('https://geo.api.com/lookup', { lat: 40.7128 })
mockFetch.mockError('https://geo.api.com/lookup', 503, 'Service Unavailable')
```

## Storage Testing

`FakeStorageService` is an in-memory storage implementation auto-registered in every test module. It replaces the real storage service and provides assertion helpers.

```typescript
it('uploads a document', async () => {
  await module.http
    .post('/api/documents')
    .withBody({ name: 'report.pdf' })
    .send()

  // Assert files were stored
  module.storage.assertExists('documents/report.pdf')
  module.storage.assertMissing('documents/old.pdf')
  module.storage.assertCount(1)

  // Inspect stored files
  const file = module.storage.getFile('documents/report.pdf')
  expect(file?.mimeType).toBe('application/pdf')
  expect(file?.size).toBeGreaterThan(0)
})

afterEach(() => {
  module.storage.clear() // reset between tests
})
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
```

## SSE Testing

```typescript
const sse = await module.sse('/streaming/events')
  .actingAs({ id: user.id })
  .connect()

await sse.assertEvent({ event: 'message', data: 'hello' })
await sse.assertJsonEventData({ status: 'done' })
await sse.waitForEnd()
```

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

## Response Cache

A `ctx.cache` stub is installed by default, so `@Cacheable` / `@PurgesCache` routes are testable with no configuration.

```typescript
const response = await module.http.get('/blog/hello-world').send()
response.assertHeader('Cache-Control', 'public, max-age=300')

await module.http.post('/posts/hello-world/publish').send()
expect(module.cache.purges).toEqual([{ tags: ['post:hello-world'] }])
```

Pass `cache: false` to `Test.createTestingModule()` to reproduce a runtime where Workers Caching is genuinely unconfigured.

## Deep Mocking

Create deeply-mocked instances of any interface or class with `createMock()` from [`@golevelup/ts-vitest`](https://github.com/golevelup/nestjs/tree/master/packages/ts-vitest):

```typescript
import { createMock, type DeepMocked } from '@stratal/testing/mocks'

let mockService: DeepMocked<PaymentService>

beforeEach(() => {
  mockService = createMock<PaymentService>()
  mockService.charge.mockResolvedValue({ id: 'ch_123', status: 'paid' })
})
```

## Sub-path Exports

```typescript
import { Test, TestingModule, createMockFetch, http, HttpResponse } from '@stratal/testing'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { stratalTest, fixPgCjs, fixNobleHashesCjs } from '@stratal/testing/vitest-plugin'
import { FakeStorageService } from '@stratal/testing/storage'
import { FakeFeatureFlagService } from '@stratal/testing/feature-flags'
```

## Support the project

If Stratal is useful to you, **[star the repository](https://github.com/strataljs/stratal)** — it is the simplest way to help others find it.

## Maintainer

Built and maintained by **Temitayo Fadojutimi** — [@adesege_](https://x.com/adesege_).

## License

MIT
