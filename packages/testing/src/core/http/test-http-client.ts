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
  private defaultHeaders: Headers
  private host: string | null
  private localeConfig: { locale: string; strategy: DetectionStrategy } | null

  constructor(
    private readonly module: TestingModule,
    host: string | null = null,
    headers: Headers = new Headers(),
    localeConfig: { locale: string; strategy: DetectionStrategy } | null = null,
  ) {
    this.host = host
    this.defaultHeaders = headers
    this.localeConfig = localeConfig
  }

  /**
   * Set the host for the request (returns a new client).
   * Also sets the Host header to ensure domain routing works
   * even when the runtime reads the header instead of the URL host.
   */
  forHost(host: string): TestHttpClient {
    const newHeaders = new Headers(this.defaultHeaders)
    newHeaders.set('Host', host)
    return new TestHttpClient(this.module, host, newHeaders, this.localeConfig)
  }

  /**
   * Set default headers for all requests (returns a new client)
   */
  withHeaders(headers: Record<string, string>): TestHttpClient {
    const newHeaders = new Headers(this.defaultHeaders)
    for (const [key, value] of Object.entries(headers)) {
      newHeaders.set(key, value)
    }
    return new TestHttpClient(this.module, this.host, newHeaders, this.localeConfig)
  }

  /**
   * Set the locale for all requests from this client (returns a new client).
   * If strategy is not provided, resolves from the module's I18n configuration.
   *
   * @param locale - Locale code (e.g., 'en', 'fr')
   * @param strategy - Detection strategy override
   */
  withLocale(locale: string, strategy?: DetectionStrategy): TestHttpClient {
    const resolved = strategy ?? resolveLocaleStrategy(this.module)
    const newHeaders = new Headers(this.defaultHeaders)
    applyLocaleToHeaders(newHeaders, locale, resolved)
    return new TestHttpClient(this.module, this.host, newHeaders, { locale, strategy: resolved })
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
