# Testing

## Setup

### Vitest Plugin

```typescript
// vitest.config.ts
import { stratalTest } from '@stratal/testing/vitest-plugin'

export default defineConfig({
  plugins: [stratalTest()],
})
```

`stratalTest()` wraps `@cloudflare/vitest-pool-workers` with Stratal defaults (tslib alias, ZenStack mocks, SSR externals).

### Setup File

```typescript
// vitest.setup.ts
import 'reflect-metadata'  // Required for tsyringe
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
// Truncate all tables
await module.truncateDb()

// Run a seeder
await module.seed(NotesSeeder)

// Assert a record exists
await module.assertDatabaseHas('note', { title: 'Test' })

// Assert a record does not exist
await module.assertDatabaseMissing('note', { title: 'Deleted' })
```

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
