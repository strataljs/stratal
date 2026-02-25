# @stratal/testing

Testing utilities and mocks for [Stratal](https://github.com/strataljs/stratal) framework applications.

[![npm version](https://img.shields.io/npm/v/@stratal/testing)](https://www.npmjs.com/package/@stratal/testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

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

## Quick Start

Set up base modules once in your Vitest setup file, then create test modules in each test:

```typescript
// vitest.setup.ts
import 'reflect-metadata'
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

// Execute code in a request-scoped container
await module.runInRequestScope(async () => {
  const scoped = module.get(REQUEST_SCOPED_TOKEN)
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

Mock external HTTP calls with `createFetchMock()`, backed by [undici MockAgent](https://undici.nodejs.org/#/docs/api/MockAgent):

```typescript
import { createFetchMock, type FetchMock } from '@stratal/testing'

describe('GeoService', () => {
  let module: TestingModule
  let fetchMock: FetchMock

  beforeEach(() => {
    fetchMock = createFetchMock()
    fetchMock.activate()
    fetchMock.disableNetConnect()
  })

  afterEach(() => {
    fetchMock.reset()
  })

  it('looks up coordinates', async () => {
    fetchMock.mockJsonResponse('https://geo.api.com/lookup', {
      lat: 40.7128,
      lng: -74.006,
    })

    const response = await module.http
      .get('/api/geo/lookup?address=NYC')
      .send()

    response.assertOk()
    await response.assertJsonPath('data.lat', 40.7128)
    fetchMock.assertNoPendingInterceptors()
  })

  it('handles API errors', async () => {
    fetchMock.mockError('https://geo.api.com/lookup', 503, 'Service Unavailable')

    const response = await module.http
      .get('/api/geo/lookup?address=NYC')
      .send()

    response.assertServerError()
  })
})
```

For advanced scenarios, access the undici `MockPool` directly:

```typescript
fetchMock
  .get('https://api.example.com')
  .intercept({ path: '/users', method: 'POST' })
  .reply(201, { id: '1' })
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

### Nodemailer mock

A drop-in mock for nodemailer, useful in Vitest's module mocking:

```typescript
// vitest.config.ts (or inline vi.mock)
export default defineConfig({
  test: {
    alias: {
      nodemailer: '@stratal/testing/mocks/nodemailer',
    },
  },
})
```

## Sub-path Exports

```typescript
import { Test, TestingModule, createFetchMock } from '@stratal/testing'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import nodemailer from '@stratal/testing/mocks/nodemailer'
```

## License

MIT
