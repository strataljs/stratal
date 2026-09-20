import { HttpException } from '../errors'

/**
 * Thrown when a guard's `canActivate` returns `false`.
 *
 * HTTP Status: 403 Forbidden
 *
 * A guard denies by returning `false` or by throwing its own error; this class is what the
 * former becomes, so both paths surface as an exception the {@link ExceptionHandler} can render
 * and an application can match with `instanceof` or replace via `renderable()`. A guard that
 * needs a different status (401 for unauthenticated, 429 for a budget) should throw its own
 * `HttpException` instead — that is passed through untouched.
 */
export class GuardRejectedError extends HttpException {
  constructor(public readonly guard: string) {
    super(403, 'Forbidden')
  }
}
