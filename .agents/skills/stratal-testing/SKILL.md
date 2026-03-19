---
name: stratal-testing
description: >-
  Use when writing tests for Stratal applications — TestingModule, HTTP testing,
  WebSocket testing, SSE testing, mocks, fakes, and auth testing utilities. Trigger on: test, TestingModule,
  TestHttpClient, TestResponse, mock, fake, FakeStorageService, createMockFetch,
  MockFetch, msw, stratalTest, createMock, ActingAs, @stratal/testing,
  TestWsRequest, TestWsConnection, ws, WebSocket, websocket, module.ws,
  TestSseRequest, TestSseConnection, TestSseEvent, sse, SSE, Server-Sent Events, module.sse.
user-invocable: false
license: MIT
metadata:
  author: Temitayo Fadojutimi
  version: "3.2"
---

# @stratal/testing

Test utilities for Stratal applications: module compilation with provider overrides, fluent HTTP client, storage fakes, fetch mocking (MSW-based), and auth testing helpers. Full documentation at [stratal.dev/testing](https://stratal.dev/testing/overview).

## Setup

Docs: [Overview](https://stratal.dev/testing/overview)

### Vitest Plugin

For e2e tests running in the Cloudflare Workers (workerd) environment, use the `stratalTest()` Vite plugin. It wraps `cloudflareTest` and applies Stratal-specific defaults (tslib alias for tsyringe, ZenStack language mocks, SSR externals).

```ts
// vitest.config.ts
import { stratalTest } from '@stratal/testing/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [stratalTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    include: ['test/e2e/**/*.spec.ts'],
  },
})
```

### Setup File

```ts
// vitest.setup.ts
import 'reflect-metadata';
import { Test } from '@stratal/testing';
Test.setBaseModules([CoreModule]);
```

Test file convention: `src/**/__tests__/**/*.spec.ts`. Always call `module.close()` in `afterEach`.

## Creating Test Modules

Docs: [Testing Module](https://stratal.dev/testing/testing-module)

```ts
const module = await Test.createTestingModule({
  imports: [UsersModule],
})
  .overrideProvider(EMAIL_TOKEN)
  .useValue(mockEmailService)
  .withEnv({ DATABASE_URL: 'test-url' })
  .compile();
```

Access services: `module.get(TOKEN)`. Access HTTP client: `module.http`. Access container: `module.container`.

## Provider Overrides

Chain overrides before `.compile()`:

```ts
Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(TOKEN_A).useValue(mockA)
  .overrideProvider(TOKEN_B).useClass(FakeB)
  .overrideProvider(TOKEN_C).useFactory(() => stub)
  .compile();
```

Use `.withEnv()` to set environment variables. Use `Test.setBaseModules()` for modules shared across all tests.

## HTTP Testing

Docs: [HTTP Testing](https://stratal.dev/testing/http-testing)

```ts
const response = await module.http
  .post('/api/v1/users')
  .withBody({ email: 'test@example.com' })
  .withHeaders({ 'X-Custom': 'value' })
  .send();

response.assertCreated();
await response.assertJsonPath('data.email', 'test@example.com');
```

Assertion methods: `assertOk()`, `assertCreated()`, `assertNotFound()`, `assertUnauthorized()`, `assertForbidden()`, `assertStatus(code)`, `assertJsonPath(path, value)`, `assertJsonStructure(shape)`.

## WebSocket Testing

Docs: [WebSocket Testing](https://stratal.dev/testing/websocket-testing)

Use `module.ws(path)` to create a WebSocket test request builder (`TestWsRequest`). Call `.connect()` to perform the upgrade and get a `TestWsConnection`.

```ts
const ws = await module.ws('/ws/chat').connect();

// Send a message and assert the response
ws.send('hello');
await ws.assertMessage('echo:hello');

// Close and assert
ws.close();
await ws.assertClosed();
```

**`TestWsRequest`** (builder pattern):
- `.withHeaders(headers)` — add custom headers to the upgrade request
- `.actingAs({ id })` — authenticate the WebSocket connection as a user
- `.connect()` — send the upgrade request, returns `TestWsConnection`

**`TestWsConnection`** methods:
- `send(data)` — send a string, ArrayBuffer, or Uint8Array
- `close(code?, reason?)` — close the connection
- `raw` — access the underlying WebSocket

**`TestWsConnection`** assertions:
- `assertMessage(expected, timeout?)` — assert the next message equals `expected`
- `assertClosed(expectedCode?, timeout?)` — assert the connection closes
- `waitForMessage(timeout?)` — wait for and return the next message
- `waitForClose(timeout?)` — wait for the connection to close

```ts
// Authenticated WebSocket
const ws = await module.ws('/ws/chat')
  .actingAs({ id: user.id })
  .withHeaders({ 'X-Custom': 'value' })
  .connect();
```

## SSE Testing

Docs: [SSE Testing](https://stratal.dev/testing/sse-testing)

Use `module.sse(path)` to create an SSE test request builder (`TestSseRequest`). Call `.connect()` to perform the request and get a `TestSseConnection`.

```ts
const sse = await module.sse('/streaming/sse').connect();

// Assert individual events
await sse.assertEvent({ event: 'message', data: 'hello' });
await sse.assertEventData('world');

// Wait for stream to end
await sse.waitForEnd();
```

**`TestSseRequest`** (builder pattern):
- `.withHeaders(headers)` — add custom headers to the request
- `.actingAs({ id })` — authenticate the SSE connection as a user
- `.connect()` — send the request, returns `TestSseConnection`

**`TestSseConnection`** methods:
- `waitForEvent(timeout?)` — wait for and return the next `TestSseEvent`
- `waitForEnd(timeout?)` — wait for the stream to end
- `collectEvents(timeout?)` — collect all remaining events until the stream ends
- `raw` — access the underlying `Response`

**`TestSseConnection`** assertions:
- `assertEvent(expected, timeout?)` — assert the next event matches a partial `TestSseEvent`
- `assertEventData(expected, timeout?)` — assert the next event's data equals the expected string
- `assertJsonEventData(expected, timeout?)` — assert the next event's data is JSON matching the expected value

**`TestSseEvent`** interface: `{ data: string, event?: string, id?: string, retry?: number }`

```ts
// Authenticated SSE with custom headers
const sse = await module.sse('/streaming/sse')
  .actingAs({ id: user.id })
  .withHeaders({ 'X-Custom': 'value' })
  .connect();

// Assert JSON event data
await sse.assertJsonEventData({ status: 'complete', count: 42 });

// Collect all remaining events
const events = await sse.collectEvents();
```

## FakeStorageService

Docs: [Mocks & Fakes](https://stratal.dev/testing/mocks-and-fakes)

Auto-registered in test modules. Access via `module.storage`. Assertions: `assertExists(path)`, `assertMissing(path)`, `assertEmpty()`, `assertCount(n)`. Utility: `getStoredPaths()`, `getFile(path)`, `clear()`.

## Fetch Mocking (MSW)

Docs: [Mocks & Fakes](https://stratal.dev/testing/mocks-and-fakes)

Built on MSW (Mock Service Worker). `http` and `HttpResponse` are re-exported from `@stratal/testing` for convenience.

```ts
import { createMockFetch } from '@stratal/testing';

const mock = createMockFetch();

beforeAll(() => mock.listen());
afterEach(() => mock.reset());
afterAll(() => mock.close());

// Convenience helpers
mock.mockJsonResponse('https://api.example.com/data', { result: 'ok' });
mock.mockError('https://api.example.com/fail', 503, 'Service Unavailable');
```

For advanced per-test handlers, use `mock.use()` with MSW request handlers:

```ts
import { createMockFetch, http, HttpResponse } from '@stratal/testing';

const mock = createMockFetch();

it('handles custom response', () => {
  mock.use(
    http.get('https://api.example.com/custom', () =>
      HttpResponse.json({ custom: true }, { status: 201 })
    )
  );
});
```

## Deep Mocks

Docs: [Mocks & Fakes](https://stratal.dev/testing/mocks-and-fakes)

```ts
import { createMock } from '@stratal/testing/mocks';

const mockEmailService = createMock<EmailService>();
mockEmailService.send.mockResolvedValueOnce(undefined);
```

Use with `overrideProvider(TOKEN).useValue(mockEmailService)`.

## Auth Testing (ActingAs)

```ts
import { ActingAs } from '@stratal/testing';

const actingAs = new ActingAs(module.get(AUTH_SERVICE));
const headers = await actingAs.createSessionForUser({ id: 'user-1' });
const response = await module.http
  .withHeaders(headers)
  .get('/api/v1/profile')
  .send();
```

## Database Testing

```ts
import { Seeder } from 'stratal/seeder';

// Truncate tables between tests
await module.truncateDb();

// Seed test data (pass class constructors, not instances)
await module.seed(UserSeeder);

// Database assertions
await module.assertDatabaseHas('user', { email: 'test@example.com' });
await module.assertDatabaseMissing('user', { email: 'deleted@example.com' });
await module.assertDatabaseCount('user', 5);
```

## Test Patterns

- Create module in `beforeEach`, call `module.close()` in `afterEach`
- Override external services (email, storage, external APIs) with mocks/fakes
- Use `module.runInRequestScope()` to test request-scoped services
- Use factories for test data, seeders for complex test setup
- Assert HTTP responses with fluent assertion chains
- Use `module.getDb()` for direct database access in tests
