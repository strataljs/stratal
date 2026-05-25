import { ApplicationError, HttpException } from '../errors'

/**
 * Thrown when a request exceeds a configured rate limit.
 *
 * HTTP Status: 429 Too Many Requests
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
    super(429, 'Too many requests')
  }
}

export class RateLimiterError extends ApplicationError {}
