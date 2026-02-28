# Testing Reference

## Setup

Install `@stratal/testing` as a dev dependency:

```bash
npm install -D @stratal/testing
# or
yarn add -D @stratal/testing
```

**Vitest configuration:**
- Test file convention: `src/**/__tests__/**/*.spec.ts`
- Setup file must import `reflect-metadata` (required for tsyringe decorators)

```typescript
// vitest.setup.ts
import 'reflect-metadata'
```

## TestingModuleBuilder

### Basic Usage

```typescript
import { Test, type TestingModule } from '@stratal/testing'

describe('UsersController', () => {
  let module: TestingModule

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [UsersModule],
    }).compile()
  })

  afterEach(async () => {
    await module.close()
  })
})
```

### TestingModuleConfig

```typescript
interface TestingModuleConfig {
  imports?: (ModuleClass | DynamicModule)[]
  providers?: Provider[]
  controllers?: Constructor[]
  consumers?: Constructor[]
  jobs?: Constructor[]
  env?: Partial<StratalEnv>          // Override environment bindings
  logging?: {
    level?: LogLevel                  // Default: LogLevel.ERROR
    formatter?: 'json' | 'pretty'    // Default: 'pretty'
  }
}
```

### Provider Overrides

Override services for testing:

```typescript
// Override with a value
const module = await Test.createTestingModule({
  imports: [UsersModule],
})
  .overrideProvider(TOKENS.UserRepository)
  .useValue(mockUserRepository)
  .compile()

// Override with a class
const module = await Test.createTestingModule({
  imports: [UsersModule],
})
  .overrideProvider(TOKENS.UserRepository)
  .useClass(InMemoryUserRepository)
  .compile()

// Override with a factory
const module = await Test.createTestingModule({
  imports: [UsersModule],
})
  .overrideProvider(TOKENS.UserRepository)
  .useFactory((container) => new MockUserRepository(container.resolve(LOGGER_TOKENS.LoggerService)))
  .compile()

// Override with an alias
const module = await Test.createTestingModule({
  imports: [UsersModule],
})
  .overrideProvider(TOKENS.UserRepository)
  .useExisting(TOKENS.MockUserRepository)
  .compile()
```

### Environment Overrides

```typescript
const module = await Test.createTestingModule({
  imports: [UsersModule],
})
  .withEnv({ ENVIRONMENT: 'test', API_KEY: 'test-key' })
  .compile()
```

### Base Modules

Set modules that are automatically included in all test modules:

```typescript
// In a global setup file
import { Test } from '@stratal/testing'

Test.setBaseModules([
  ConfigModule.forRoot({ load: [appConfig] }),
  I18nModule.withRoot({ defaultLocale: 'en', messages: { en: testMessages } }),
])
```

## TestingModule API

```typescript
class TestingModule {
  // Resolve a service from the DI container
  get<T>(token: InjectionToken<T>): T

  // HTTP testing client
  get http(): TestHttpClient

  // Fake storage service (auto-registered)
  get storage(): FakeStorageService

  // Access the Application instance
  get application(): Application

  // Access the Container instance
  get container(): Container

  // Send a raw fetch request through the application
  async fetch(request: Request): Promise<Response>

  // Run code in request scope
  async runInRequestScope<T>(callback: () => T | Promise<T>): Promise<T>

  // Cleanup the module
  async close(): Promise<void>
}
```

## TestHttpClient

### Making Requests

```typescript
// GET
const response = await module.http.get('/api/v1/users').send()

// POST with JSON body
const response = await module.http
  .post('/api/v1/users')
  .withBody({ name: 'Alice', email: 'alice@example.com' })
  .asJson()
  .send()

// PUT with headers
const response = await module.http
  .put('/api/v1/users/123')
  .withBody({ name: 'Alice Updated' })
  .withHeaders({ Authorization: 'Bearer token123' })
  .asJson()
  .send()

// PATCH
const response = await module.http
  .patch('/api/v1/users/123')
  .withBody({ name: 'New Name' })
  .asJson()
  .send()

// DELETE
const response = await module.http.delete('/api/v1/users/123').send()
```

### TestHttpClient Methods

```typescript
class TestHttpClient {
  forHost(host: string): this             // Set host (default: http://localhost)
  withHeaders(headers: Record<string, string>): this  // Default headers for all requests

  get(path: string): TestHttpRequest
  post(path: string): TestHttpRequest
  put(path: string): TestHttpRequest
  patch(path: string): TestHttpRequest
  delete(path: string): TestHttpRequest
}
```

### TestHttpRequest Methods

```typescript
class TestHttpRequest {
  withBody(data: unknown): this           // Set request body
  withHeaders(headers: Record<string, string>): this  // Add headers
  asJson(): this                          // Set Content-Type: application/json

  send(): Promise<TestResponse>           // Execute request
}
```

## TestResponse Assertions

### Status Assertions

```typescript
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
```

### JSON Assertions

```typescript
// Assert exact JSON body match
response.assertJson({ id: '123', name: 'Alice' })

// Assert value at JSON path
response.assertJsonPath('name', 'Alice')
response.assertJsonPath('data.users[0].email', 'alice@example.com')

// Assert JSON structure (keys exist)
response.assertJsonStructure(['id', 'name', 'email'])

// Assert path exists/missing
response.assertJsonPathExists('data.user')
response.assertJsonPathMissing('data.password')

// Assert path value matches predicate
response.assertJsonPathMatches('age', (value) => value > 18)

// Assert string contains
response.assertJsonPathContains('message', 'success')

// Assert array includes item
response.assertJsonPathIncludes('tags', 'admin')

// Assert array/object count
response.assertJsonPathCount('data.items', 5)

// Assert multiple paths at once
response.assertJsonPaths({
  'name': 'Alice',
  'email': 'alice@example.com',
  'role': 'admin',
})
```

### Header Assertions

```typescript
response.assertHeader('Content-Type', 'application/json')
response.assertHeader('X-Request-Id')        // Assert header exists
response.assertHeaderMissing('X-Debug')      // Assert header missing
```

### Raw Access

```typescript
response.raw        // Raw Response object
response.status     // Status code number
response.headers    // Headers object
await response.json<T>()  // Parse JSON body
await response.text()     // Get text body
```

## FakeStorageService

Auto-registered in all test modules. Provides in-memory file storage for testing.

### Usage

```typescript
const module = await Test.createTestingModule({
  imports: [FilesModule],
}).compile()

// Upload via the application (through controller/service)
await module.http
  .post('/api/v1/files')
  .withBody(fileData)
  .send()

// Assert file exists
module.storage.assertExists('uploads/avatar.jpg')
module.storage.assertMissing('uploads/deleted.jpg')
module.storage.assertCount(1)
```

### FakeStorageService Methods

```typescript
class FakeStorageService extends StorageService {
  // Same methods as StorageService (upload, download, delete, exists, etc.)

  // Assertion helpers
  assertExists(path: string): void
  assertMissing(path: string): void
  assertEmpty(): void
  assertCount(count: number): void

  // Inspection
  getStoredFiles(): Map<string, StoredFile>
  getStoredPaths(): string[]
  getFile(path: string): StoredFile | undefined

  // Reset
  clear(): void
}

interface StoredFile {
  content: Uint8Array
  mimeType: string
  size: number
  metadata?: Record<string, string>
  uploadedAt: Date
}
```

## FetchMock

Mock external HTTP requests in tests:

```typescript
import { createFetchMock } from '@stratal/testing'

const fetchMock = createFetchMock()

beforeEach(() => {
  fetchMock.activate()
  fetchMock.disableNetConnect()
})

afterEach(() => {
  fetchMock.assertNoPendingInterceptors()
  fetchMock.deactivate()
})

it('calls external API', async () => {
  fetchMock.mockJsonResponse('https://api.example.com/users', {
    data: [{ id: '1', name: 'Alice' }],
  })

  const response = await module.http.get('/api/v1/external-users').send()
  response.assertOk()
})
```

### FetchMock Methods

```typescript
class FetchMock {
  activate(): void
  deactivate(): void
  disableNetConnect(): void
  enableNetConnect(host?: string): void
  assertNoPendingInterceptors(): void
  reset(): void

  // Convenience methods
  mockJsonResponse(url: string, data: unknown, options?: MockJsonOptions): void
  mockError(url: string, status: number, message?: string, options?: MockErrorOptions): void
  mockRequest(origin: string, options: object): void

  // Get MockPool for fine-grained control
  get(origin: string): MockPool
}
```

## Test Patterns

### Testing a Controller with Mocked Service

```typescript
describe('NotesController', () => {
  let module: TestingModule
  const mockNoteService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  }

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [NotesModule],
    })
      .overrideProvider(NOTE_TOKENS.NoteService)
      .useValue(mockNoteService)
      .compile()
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await module.close()
  })

  it('returns all notes', async () => {
    mockNoteService.findAll.mockResolvedValue([
      { id: '1', title: 'Note 1' },
    ])

    const response = await module.http.get('/api/v1/notes').send()

    response.assertOk()
    response.assertJsonPathCount('', 1)
    response.assertJsonPath('[0].title', 'Note 1')
  })
})
```

### Testing Queue Consumers

```typescript
describe('WelcomeEmailConsumer', () => {
  let module: TestingModule

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [NotificationsModule],
    })
      .overrideProvider(EMAIL_TOKENS.EmailService)
      .useValue({ send: vi.fn() })
      .compile()
  })

  it('sends welcome email', async () => {
    const consumer = module.get<WelcomeEmailConsumer>(WelcomeEmailConsumer)
    await consumer.handle({
      id: 'msg-1',
      timestamp: Date.now(),
      type: 'user.registered',
      payload: { userId: '1', email: 'alice@example.com', name: 'Alice' },
    })

    const emailService = module.get(EMAIL_TOKENS.EmailService)
    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@example.com' }),
    )
  })
})
```
