import { http, HttpResponse, type RequestHandler } from 'msw'
import { setupServer, type SetupServer } from 'msw/node'
import type { MockErrorOptions, MockJsonOptions } from './fetch-mock.types'

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options'

/**
 * MSW-based fetch mock for declarative HTTP mocking in tests.
 *
 * Replaces the old Cloudflare `fetchMock` (undici MockAgent) with MSW's `setupServer`.
 * Works in both Node.js and workerd test environments.
 *
 * @example
 * ```typescript
 * import { createMockFetch } from '@stratal/testing'
 *
 * const mock = createMockFetch()
 *
 * beforeAll(() => mock.listen())
 * afterEach(() => mock.reset())
 * afterAll(() => mock.close())
 *
 * it('should mock external API', async () => {
 *   mock.mockJsonResponse('https://api.example.com/data', { success: true })
 *
 *   const response = await fetch('https://api.example.com/data')
 *   const json = await response.json()
 *
 *   expect(json.success).toBe(true)
 * })
 * ```
 */
export class MockFetch {
  private server: SetupServer

  constructor(handlers: RequestHandler[] = []) {
    this.server = setupServer(...handlers)
  }

  /** Start intercepting. Call in beforeAll/beforeEach. */
  listen() {
    this.server.listen({ onUnhandledRequest: 'error' })
  }

  /** Reset runtime handlers. Call in afterEach. */
  reset() {
    this.server.resetHandlers()
  }

  /** Stop intercepting. Call in afterAll. */
  close() {
    this.server.close()
  }

  /** Add runtime handler(s) for a single test. */
  use(...handlers: RequestHandler[]) {
    this.server.use(...handlers)
  }

  /**
   * Mock a JSON response.
   *
   * @param url - Full URL to mock (e.g., 'https://api.example.com/users')
   * @param data - JSON data to return
   * @param options - HTTP method, status code, headers
   *
   * @example
   * ```typescript
   * mock.mockJsonResponse('https://api.example.com/users', { users: [] })
   * mock.mockJsonResponse('https://api.example.com/users', { created: true }, { method: 'POST', status: 201 })
   * ```
   */
  mockJsonResponse(url: string, data: Record<string, unknown> | unknown[], options: MockJsonOptions = {}) {
    const method = (options.method ?? 'GET').toLowerCase() as HttpMethod
    const handler = http[method](url, () =>
      HttpResponse.json(data, {
        status: options.status ?? 200,
        headers: options.headers,
      }),
    )
    this.server.use(handler)
  }

  /**
   * Mock an error response.
   *
   * @param url - Full URL to mock
   * @param status - HTTP error status code
   * @param message - Optional error message
   * @param options - HTTP method, headers
   *
   * @example
   * ```typescript
   * mock.mockError('https://api.example.com/fail', 401, 'Unauthorized')
   * mock.mockError('https://api.example.com/fail', 500, 'Server Error', { method: 'POST' })
   * ```
   */
  mockError(url: string, status: number, message?: string, options: MockErrorOptions = {}) {
    const method = (options.method ?? 'GET').toLowerCase() as HttpMethod
    const body = message ? { error: message } : undefined
    this.server.use(
      http[method](url, () =>
        HttpResponse.json(body, { status, headers: options.headers }),
      ),
    )
  }
}

/**
 * Factory function to create a new MockFetch instance
 *
 * @param handlers - Optional initial MSW request handlers
 * @returns A new MockFetch instance
 *
 * @example
 * ```typescript
 * import { createMockFetch } from '@stratal/testing'
 *
 * const mock = createMockFetch()
 *
 * beforeAll(() => mock.listen())
 * afterEach(() => mock.reset())
 * afterAll(() => mock.close())
 * ```
 */
export function createMockFetch(handlers?: RequestHandler[]): MockFetch {
  return new MockFetch(handlers)
}
