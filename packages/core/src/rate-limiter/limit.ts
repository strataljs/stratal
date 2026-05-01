import type { RouterContext } from '../router/router-context'

/**
 * Standard rate-limit response headers passed to custom response handlers.
 * Keys are canonical HTTP header names; values are the stringified counts.
 */
export interface RateLimitHeaders {
  'Retry-After': string
  'X-RateLimit-Limit': string
  'X-RateLimit-Remaining': string
  'X-RateLimit-Reset': string
}

/**
 * Custom response handler invoked when a limit is exceeded and the user
 * supplied `.response()` on the {@link Limit}. Receives the request context
 * and the precomputed standard headers (which the handler can spread, drop,
 * or override).
 */
export type RateLimitResponseHandler = (
  ctx: RouterContext,
  headers: RateLimitHeaders,
) => Response | Promise<Response>

/**
 * A single rate limit window.
 *
 * Build via the static factories (`perSecond`, `perMinute`, `perMinutes`,
 * `perHour`, `perDay`, `none`). Chain `.by(key)` to scope per-actor and
 * `.response(handler)` to override the default 429 response.
 *
 * Returned (singly or as an array) by limiter resolvers registered via
 * `RateLimiterRegistry.for()`.
 *
 * @example
 * ```typescript
 * Limit.perMinute(60).by(ctx.header('cf-connecting-ip') ?? 'global')
 * Limit.perHour(100).by(userId)
 * Limit.none()                                // bypass
 * ```
 */
export class Limit {
  private _key?: string
  private _customResponse?: RateLimitResponseHandler

  private constructor(
    public readonly windowSeconds: number,
    public readonly max: number,
    public readonly disabled = false,
  ) {}

  static perSecond(max: number): Limit {
    return new Limit(1, max)
  }

  static perMinute(max: number): Limit {
    return new Limit(60, max)
  }

  static perMinutes(minutes: number, max: number): Limit {
    return new Limit(minutes * 60, max)
  }

  static perHour(max: number): Limit {
    return new Limit(60 * 60, max)
  }

  static perDay(max: number): Limit {
    return new Limit(24 * 60 * 60, max)
  }

  /** Bypass the limiter entirely for this request. */
  static none(): Limit {
    return new Limit(0, 0, true)
  }

  /** Scope this limit to a specific actor (user id, IP, tenant, etc.). */
  by(key: string | number): this {
    this._key = String(key)
    return this
  }

  /**
   * Override the default 429 response. The handler receives the standard
   * `RateLimitHeaders` so it can spread them onto its own Response or omit
   * them as it sees fit.
   */
  response(handler: RateLimitResponseHandler): this {
    this._customResponse = handler
    return this
  }

  get key(): string | undefined {
    return this._key
  }

  get customResponse(): RateLimitResponseHandler | undefined {
    return this._customResponse
  }
}
