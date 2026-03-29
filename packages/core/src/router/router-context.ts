import type { Context } from 'hono'
import type { SSEStreamingApi } from 'hono/streaming'
import { stream as honoStream, streamSSE as honoStreamSSE, streamText as honoStreamText } from 'hono/streaming'
import type { ContentfulStatusCode, RedirectStatusCode } from 'hono/utils/http-status'
import type { StreamingApi } from 'hono/utils/stream'
import type { Container } from '../di/container'
import { RequestContainerNotInitializedError } from '../errors'
import { Macroable } from '../macroable'
import { ROUTER_CONTEXT_KEYS } from './constants'
import type { RouteName, RouteParams } from './route-map'
import { ROUTER_TOKENS } from './router.tokens'
import type { RouterEnv } from './types'
import type { SignedUriOptions, Uri, UriOptions } from './uri'

export type ContextQueryResult<R extends Record<string, unknown> | undefined, K extends string | undefined> = K extends string ? string : R extends undefined ? Record<string, unknown> : R

/**
 * Router context wrapper with helper methods
 *
 * Provides convenient access to Hono's context and common request/response operations.
 * The native Hono context is available via the `c` property for advanced use cases.
 *
 * @example
 * ```typescript
 * async index(ctx: RouterContext): Promise<Response> {
 *   // Use helper methods
 *   const users = await this.service.findAll()
 *   return ctx.json(users)
 * }
 *
 * async show(ctx: RouterContext): Promise<Response> {
 *   // Access route params
 *   const id = ctx.param('id')
 *   const user = await this.service.findById(id)
 *   return ctx.json(user)
 * }
 *
 * async create(ctx: RouterContext): Promise<Response> {
 *   // Parse request body
 *   const body = await ctx.body<CreateUserInput>()
 *   const user = await this.service.create(body)
 *   return ctx.json(user, 201)
 * }
 * ```
 */
export class RouterContext<T extends RouterEnv = RouterEnv> extends Macroable {
  /**
   * Native Hono context
   * Access for advanced use cases not covered by helper methods
   */
  constructor(
    public readonly c: Context<T>
  ) {
    super()
  }

  /**
   * Get request-scoped DI container
   * Contains request-specific services and context (AuthContext)
   *
   * @throws Error if container not initialized
   */
  getContainer(): Container {
    const container = this.c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER)
    if (!container) {
      throw new RequestContainerNotInitializedError()
    }
    return container as Container
  }

  /**
   * Set locale for the current request
   *
   * @param locale - Locale code (e.g., 'en', 'fr')
   */
  setLocale(locale: string): void {
    this.c.set(ROUTER_CONTEXT_KEYS.LOCALE, locale)
  }

  /**
   * Get locale for the current request
   *
   * @returns Current locale code
   */
  getLocale(): string {
    const locale = this.c.get(ROUTER_CONTEXT_KEYS.LOCALE)
    return (locale as string) || 'en'
  }

  /**
   * Return JSON response
   *
   * When data is null, automatically returns 204 No Content (configurable via status param).
   *
   * @param data - Data to serialize as JSON, or null for 204
   * @param status - HTTP status code (default: 200, or 204 when data is null)
   */
  json(data: object | null, status?: ContentfulStatusCode): Response {
    if (data === null) {
      return this.c.body(null, status ?? 204)
    }
    return this.c.json(data, status)
  }

  /**
   * Get route parameter value
   *
   * @param key - Parameter name (e.g., 'id' for /users/:id)
   */
  param(key: string): string {
    return (this.c.req as unknown as { valid(target: 'param'): Record<string, string> }).valid('param')[key]
  }

  /**
   * Get query parameter value
   *
   * @param key - Query parameter name
   */
  query<R extends Record<string, unknown> | undefined = undefined, K extends string | undefined = undefined>(key?: K): ContextQueryResult<R, K> {
    const validated = (this.c.req as unknown as { valid(target: 'query'): Record<string, unknown> }).valid('query')
    return key ? validated[key] as ContextQueryResult<R, K> : validated as ContextQueryResult<R, K>
  }

  /**
   * Get request header value
   *
   * @param name - Header name (case-insensitive)
   */
  header(name: string): string | undefined {
    return this.c.req.header(name)
  }

  /**
   * Get validated request body from OpenAPI route
   * Returns pre-validated data that has passed schema validation
   *
   * @returns Validated JSON body
   */
  body<T>(): Promise<T> {
    // Type assertion needed because req.valid() is type-safe per route
    // but this is a generic helper method that works across all routes
    return (this.c.req as unknown as { valid(target: 'json'): Promise<T> }).valid('json')
  }

  /**
   * Return text response
   *
   * @param text - Text content
   * @param status - HTTP status code (default: 200)
   */
  text(text: string, status?: ContentfulStatusCode): Response {
    return this.c.text(text, status)
  }

  /**
   * Return HTML response
   *
   * @param html - HTML content
   * @param status - HTTP status code (default: 200)
   */
  html(html: string, status?: ContentfulStatusCode): Response {
    return this.c.html(html, status)
  }

  /**
   * Generate a URL from a named route.
   *
   * Keys matching `:param` placeholders fill the path.
   * Domain params are consumed from the same object.
   * Extra keys become query string parameters.
   *
   * @param name - Named route identifier
   * @param params - Route params + domain params + extra query params
   * @param options - URL generation options (e.g., `{ absolute: true }`)
   *
   * @example
   * ```typescript
   * ctx.route('users.show', { id: '1' })           // '/v1/users/1'
   * ctx.route('users.show', { id: '1', q: 'test' }) // '/v1/users/1?q=test'
   * ```
   */
  route<N extends RouteName>(name: N, params?: RouteParams<N>, options?: UriOptions): string {
    return this.resolveUri().route(name, params, options)
  }

  /**
   * Get a domain parameter value from the current request.
   * Domain params are set by the domain matching middleware.
   *
   * @param key - Domain parameter name (e.g., 'tenant' from '{tenant}.myapp.com')
   *
   * @example
   * ```typescript
   * const tenant = ctx.domain('tenant')
   * ```
   */
  domain(key: string): string {
    return this.c.get(`domain:${key}`) as string
  }

  /**
   * Generate a signed URL from a named route.
   *
   * @param name - Named route identifier
   * @param params - Route params (same as route())
   * @param options - Signing options (e.g., expiresIn) and URL options
   * @returns Signed URL string with signature query param
   */
  async signedUrl<N extends RouteName>(name: N, params?: RouteParams<N>, options?: SignedUriOptions): Promise<string> {
    return this.resolveUri().signedRoute(name, params, options)
  }

  /**
   * Check if the current request has a valid signature.
   *
   * @returns true if the URL signature is valid and not expired
   */
  async hasValidSignature(): Promise<boolean> {
    return this.resolveUri().hasValidSignature()
  }

  /**
   * Redirect to another URL
   *
   * @param url - Target URL
   * @param status - HTTP status code (default: 302)
   */
  redirect(url: string, status?: RedirectStatusCode): Response {
    return this.c.redirect(url, status)
  }

  /**
   * Return a streaming response (binary/generic)
   *
   * @param callback - Async function that writes to the stream
   * @param onError - Optional error handler called if an error occurs during streaming
   */
  stream(callback: (stream: StreamingApi) => Promise<void>, onError?: (err: Error, stream: StreamingApi) => Promise<void>): Response {
    return honoStream(this.c, callback, onError)
  }

  /**
   * Return a streaming text response
   *
   * Automatically sets `Content-Encoding: Identity` for Cloudflare Workers compatibility.
   *
   * @param callback - Async function that writes text to the stream
   * @param onError - Optional error handler called if an error occurs during streaming
   */
  streamText(callback: (stream: StreamingApi) => Promise<void>, onError?: (err: Error, stream: StreamingApi) => Promise<void>): Response {
    this.c.header('Content-Encoding', 'Identity')
    return honoStreamText(this.c, callback, onError)
  }

  /**
   * Return a Server-Sent Events (SSE) streaming response
   *
   * Automatically sets `Content-Encoding: Identity` for Cloudflare Workers compatibility.
   *
   * @param callback - Async function that writes SSE events to the stream
   * @param onError - Optional error handler called if an error occurs during streaming
   */
  streamSSE(callback: (stream: SSEStreamingApi) => Promise<void>, onError?: (err: Error, stream: SSEStreamingApi) => Promise<void>): Response {
    this.c.header('Content-Encoding', 'Identity')
    return honoStreamSSE(this.c, callback, onError)
  }

  private resolveUri(): Uri {
    return this.getContainer().resolve<Uri>(ROUTER_TOKENS.Uri)
  }
}
