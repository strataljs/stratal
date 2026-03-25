import type { DetectionStrategy } from 'stratal/i18n'
import type { TestingModule } from '../testing-module'
import { applyLocaleToHeaders, resolveLocaleStrategy } from './locale-helper'
import { TestHttpRequest } from './test-http-request'

/**
 * TestHttpClient
 *
 * Fluent HTTP client for making test requests.
 *
 * @example
 * ```typescript
 * const response = await module.http
 *   .forHost('example.com')
 *   .post('/api/v1/users')
 *   .withBody({ name: 'Test' })
 *   .send()
 *
 * response.assertCreated()
 * ```
 */
export class TestHttpClient {
  private defaultHeaders: Headers = new Headers()
  private host: string | null = null
  private localeConfig: { locale: string; strategy: DetectionStrategy } | null = null

  constructor(private readonly module: TestingModule) { }

  /**
   * Set the host for the request
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
   * Set the locale for all requests from this client.
   * If strategy is not provided, resolves from the module's I18n configuration.
   *
   * @param locale - Locale code (e.g., 'en', 'fr')
   * @param strategy - Detection strategy override
   */
  withLocale(locale: string, strategy?: DetectionStrategy): this {
    const resolved = strategy ?? resolveLocaleStrategy(this.module)
    this.localeConfig = { locale, strategy: resolved }
    applyLocaleToHeaders(this.defaultHeaders, locale, resolved)
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
    return new TestHttpRequest(method, path, this.defaultHeaders, this.module, this.host, this.localeConfig)
  }
}
