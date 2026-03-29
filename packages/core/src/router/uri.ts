import { inject } from 'tsyringe'
import { Transient } from '../di/decorators'
import { MissingRouteParamError, RouteNameNotFoundError } from './errors'
import type { RouteName, RouteParams } from './route-map'
import type { RegisteredRoute, RouteRegistry } from './route-registry'
import type { RouterContext } from './router-context'
import { ROUTER_TOKENS } from './router.tokens'
import { signUrl, verifySignedUrl, type SignedUrlOptions } from './signed-url'

/**
 * Options for URL generation methods.
 */
export interface UriOptions {
  /** Generate absolute URL (scheme + host). Defaults to false. */
  absolute?: boolean
}

/**
 * Options for signed URL generation methods.
 */
export interface SignedUriOptions extends UriOptions, SignedUrlOptions { }

/**
 * Build a URL from a registered route, filling path/domain params and appending extras as query string.
 *
 * Pure function — no request context needed. Used by both the `Uri` class and the standalone `route()` function.
 *
 * @param route - The registered route to build a URL for
 * @param name - Route name (used in error messages)
 * @param params - Path params, domain params, and extra query params
 * @returns Relative URL string (or absolute with domain prefix if route has a domain pattern)
 *
 * @throws MissingRouteParamError if a required path or domain param is missing
 */
export function buildRouteUrl(
  route: RegisteredRoute,
  name: string,
  params?: Record<string, string>,
): string {
  const allParams = { ...params }
  const consumedKeys = new Set<string>()
  let url = route.path

  // When locale is provided and route has locale variants, prepend locale segment
  if (allParams.locale && route.localePaths?.length) {
    url = `/${allParams.locale}${url === '/' ? '' : url}`
    consumedKeys.add('locale')
  }

  // Fill path :param placeholders (handles optional regex constraints like :locale{en|de|fr})
  for (const paramName of route.paramNames) {
    const value = allParams[paramName]
    if (value === undefined) {
      throw new MissingRouteParamError(paramName, name, route.path)
    }
    url = url.replace(
      new RegExp(`:${paramName}(\\{[^}]*\\})?`),
      encodeURIComponent(value),
    )
    consumedKeys.add(paramName)
  }

  // Build domain if present
  let domain: string | undefined
  if (route.domain) {
    domain = route.domain
    for (const domainParam of route.domainParamNames) {
      const value = allParams[domainParam]
      if (value === undefined) {
        throw new MissingRouteParamError(domainParam, name, route.domain)
      }
      domain = domain.replace(`{${domainParam}}`, encodeURIComponent(value))
      consumedKeys.add(domainParam)
    }
  }

  // Remaining params (not consumed by path or domain) become query string
  const queryEntries = Object.entries(allParams).filter(([key]) => !consumedKeys.has(key))
  if (queryEntries.length > 0) {
    const queryString = queryEntries
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')
    url = `${url}${queryString.length ? `?${queryString}` : ''}`
  }

  // Prepend domain if present
  if (domain) {
    url = `https://${domain}${url}`
  }

  return url
}

/**
 * URL generation service for named routes, signed URLs, and request URL access.
 *
 * Registered as request-scoped in the container — has access to the current request
 * via RouterContext for features like `current()`, `full()`, and signed URLs.
 *
 * @example
 * ```typescript
 * // In a controller:
 * const uri = ctx.getContainer().resolve<Uri>(ROUTER_TOKENS.Uri)
 * uri.route('users.show', { id: '1' })
 * uri.current()
 * await uri.signedRoute('unsubscribe', { user: '1' }, { expiresIn: 3600 })
 *
 * // Set defaults (e.g., in middleware):
 * uri.defaults({ locale: 'en' })
 * uri.route('posts.index') // auto-fills :locale param
 * ```
 */
@Transient()
export class Uri {
  private _defaults: Record<string, string> = {}

  constructor(
    @inject(ROUTER_TOKENS.RouteRegistry) private readonly registry: RouteRegistry,
    @inject(ROUTER_TOKENS.RouterContext) private readonly routerContext: RouterContext,
  ) { }

  /**
   * Set default URL parameters for this request.
   * Applied to all subsequent `route()` calls — explicit params override defaults.
   *
   * @param params - Default parameters (e.g., `{ locale: 'en' }`)
   */
  defaults(params: Record<string, string>): void {
    this._defaults = { ...this._defaults, ...params }
  }

  /**
   * Generate a URL from a named route.
   *
   * Keys matching `:param` placeholders fill the path.
   * Domain params (`{tenant}`) are consumed from the same object.
   * Extra keys become query string parameters.
   * Default params (from `defaults()`) are merged — explicit params override.
   *
   * @param name - Named route identifier
   * @param params - Route params + domain params + extra query params
   * @param options - URL generation options
   * @returns Generated URL string
   *
   * @throws RouteNameNotFoundError if route name not found
   * @throws MissingRouteParamError if required params missing
   */
  route<N extends RouteName>(name: N, params?: RouteParams<N>, options?: UriOptions): string {
    const registeredRoute = this.registry.get(name)
    if (!registeredRoute) {
      throw new RouteNameNotFoundError(name)
    }

    const mergedParams = { ...this._defaults, ...params } as Record<string, string>
    let url = buildRouteUrl(registeredRoute, name, mergedParams)

    if (options?.absolute && !url.startsWith('http')) {
      const origin = new URL(this.routerContext.c.req.url).origin
      url = `${origin}${url}`
    }

    return url
  }

  /**
   * Generate a signed URL from a named route.
   *
   * @param name - Named route identifier
   * @param params - Route params + domain params + extra query params
   * @param options - Signing options (e.g., expiresIn) and URL options
   * @returns Signed URL string with signature query param
   *
   * @throws Error if APP_SECRET environment variable is not set
   */
  async signedRoute<N extends RouteName>(name: N, params?: RouteParams<N>, options?: SignedUriOptions): Promise<string> {
    const url = this.route(name, params, options)
    const secret = this.getAppSecret()
    return signUrl(url, secret, options)
  }

  /**
   * Generate a temporary signed URL from a named route.
   *
   * @param name - Named route identifier
   * @param expiresIn - Time-to-live in seconds
   * @param params - Route params + domain params + extra query params
   * @param options - URL generation options
   * @returns Signed URL string with signature and expires query params
   *
   * @throws Error if APP_SECRET environment variable is not set
   */
  async temporarySignedRoute<N extends RouteName>(name: N, expiresIn: number, params?: RouteParams<N>, options?: UriOptions): Promise<string> {
    return this.signedRoute(name, params, { ...options, expiresIn })
  }

  /**
   * Check if the current request has a valid signature.
   *
   * @returns true if the URL signature is valid and not expired
   */
  async hasValidSignature(): Promise<boolean> {
    const secret = (this.routerContext.c.env as unknown as Record<string, string>).APP_SECRET
    if (!secret) return false
    return verifySignedUrl(this.routerContext.c.req.url, secret)
  }

  /**
   * Get the current request URL pathname (without query string).
   */
  current(): string {
    const parsed = new URL(this.routerContext.c.req.url)
    return parsed.pathname
  }

  /**
   * Get the current request URL with query string (pathname + search).
   */
  full(): string {
    const parsed = new URL(this.routerContext.c.req.url)
    return `${parsed.pathname}${parsed.search}`
  }

  /**
   * Get the previous request URL from the Referer header.
   *
   * @param fallback - URL to return if no Referer header (default: '/')
   */
  previous(fallback = '/'): string {
    return this.routerContext.c.req.header('referer') ?? fallback
  }

  /**
   * Get the previous request URL pathname (no query string or host) from the Referer header.
   *
   * @param fallback - Path to return if no Referer header (default: '/')
   */
  previousPath(fallback = '/'): string {
    const referer = this.routerContext.c.req.header('referer')
    if (!referer) return fallback

    try {
      const parsed = new URL(referer)
      return parsed.pathname
    } catch {
      return referer
    }
  }

  /**
   * Build a URL to a raw path (not a named route) with optional query params.
   *
   * @param path - URL path (e.g., '/users')
   * @param queryParams - Query parameters to append
   * @param options - URL generation options
   */
  to(path: string, queryParams?: Record<string, string>, options?: UriOptions): string {
    let url = path

    if (queryParams) {
      const entries = Object.entries(queryParams)
      if (entries.length > 0) {
        const queryString = entries
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
          .join('&')
        url = url.includes('?') ? `${url}&${queryString}` : `${url}?${queryString}`
      }
    }

    if (options?.absolute && !url.startsWith('http')) {
      const origin = new URL(this.routerContext.c.req.url).origin
      url = `${origin}${url}`
    }

    return url
  }

  /**
   * Build a URL with query string parameters. Merges with existing query params in path.
   *
   * @param path - URL path, may already contain query params
   * @param queryParams - Query parameters to merge (new values override existing)
   */
  query(path: string, queryParams: Record<string, string>): string {
    const parsed = new URL(path, 'https://placeholder.local')
    for (const [key, value] of Object.entries(queryParams)) {
      parsed.searchParams.set(key, value)
    }
    return `${parsed.pathname}${parsed.search}`
  }

  private getAppSecret(): string {
    const secret = (this.routerContext.c.env as unknown as Record<string, string>).APP_SECRET
    if (!secret) {
      throw new Error('APP_SECRET environment variable is required for signed URLs')
    }
    return secret
  }
}
