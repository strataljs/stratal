// eslint-disable-next-line @typescript-eslint/no-deprecated -- ApplicationError remains the canonical base for non-HTTP errors that need i18n metadata interpolation; matches MissingEnvironmentVariableError pattern.
import { ApplicationError, ERROR_CODES, HttpException } from '../errors'

/**
 * Thrown when a request exceeds a configured rate limit.
 *
 * HTTP Status: 429 Too Many Requests
 * Error Code:  4290
 *
 * The {@link ExceptionHandler} renders the body via content negotiation
 * (HTML for HTML clients, JSON for everything else). Standard rate-limit
 * headers (`Retry-After`, `X-RateLimit-*`) are injected by the
 * `respond()` callback registered via `RateLimiterModule.onException`.
 */
export class TooManyRequestsError extends HttpException {
  constructor(
    public readonly info: { retryAfter: number; limit: number; resetAt: number },
  ) {
    super(429, 'errors.rateLimit.tooManyRequests')
  }
}

/**
 * Thrown when `RateLimiterRegistry.handle(name, ...)` is invoked for a
 * name that was never registered via `.for()`.
 *
 * Most likely cause: a typo in `router.throttle('foo')` or `@RateLimit('foo')`,
 * or the module that registers the limiter is missing from imports.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- needs metadata interpolation
export class RateLimiterNotDefinedError extends ApplicationError {
  constructor(public readonly limiterName: string) {
    super(
      'errors.rateLimit.notDefined',
      ERROR_CODES.SYSTEM.CONFIGURATION_ERROR,
      { name: limiterName },
    )
  }
}

/**
 * Thrown by `RateLimiterStoreFactory.create()` (during the module's eager
 * `onInitialize` validation) when the user imported `RateLimiterModule`
 * without calling `.forRoot({ store: ... })`. There is no implicit default
 * store — the user must pick one.
 */
export class RateLimiterNotConfiguredError extends HttpException {
  constructor() {
    super(500, 'errors.rateLimit.notConfigured')
  }
}

/**
 * Thrown when a throttled route fires but `RateLimiterModule` was never
 * imported in the user's AppModule (so the registry token is unbound).
 *
 * Distinct from {@link RateLimiterNotConfiguredError}, which fires when
 * the module IS imported but `forRoot` was not called.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- needs metadata interpolation
export class RateLimiterModuleNotImportedError extends ApplicationError {
  constructor(public readonly limiterName: string) {
    super(
      'errors.rateLimit.moduleNotImported',
      ERROR_CODES.SYSTEM.CONFIGURATION_ERROR,
      { name: limiterName },
    )
  }
}

