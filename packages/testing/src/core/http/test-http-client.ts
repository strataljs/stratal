import type { TestingModule } from '../testing-module'
import { TestHttpRequest } from './test-http-request'

/**
 * TestHttpClient
 *
 * Fluent HTTP client for making test requests.
 *
 * @example
 * ```typescript
 * const response = await module.http
 *   .forHost('school.admsn.test')
 *   .post('/api/v1/register')
 *   .withBody({ schoolInfo: { name: 'Test' } })
 *   .send()
 *
 * response.assertCreated()
 * ```
 */
export class TestHttpClient {
  private defaultHeaders: Headers = new Headers()
  private host: string | null = null

  constructor(private readonly module: TestingModule) { }

  /**
   * Set the host for the request (used for tenant identification)
   */
  forHost(host: string): this {
    this.host = host
    return this
  }

  /**
   * Set default headers for all requests
   */
  withHeaders(headers: Record<string, string>): this {
    for (const [key, value] of Object.entries(headers)) {
      this.defaultHeaders.set(key, value)
    }
    return this
  }

  /**
   * Create a GET request
   */
  get(path: string): TestHttpRequest {
    return this.createRequest('GET', path)
  }

  /**
   * Create a POST request
   */
  post(path: string): TestHttpRequest {
    return this.createRequest('POST', path)
  }

  /**
   * Create a PUT request
   */
  put(path: string): TestHttpRequest {
    return this.createRequest('PUT', path)
  }

  /**
   * Create a PATCH request
   */
  patch(path: string): TestHttpRequest {
    return this.createRequest('PATCH', path)
  }

  /**
   * Create a DELETE request
   */
  delete(path: string): TestHttpRequest {
    return this.createRequest('DELETE', path)
  }

  private createRequest(method: string, path: string): TestHttpRequest {
    return new TestHttpRequest(method, path, this.defaultHeaders, this.module, this.host)
  }
}
