import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * Thrown when `router.use()` is called inside a `group()` callback.
 * `use()` registers global middleware and is only allowed on the root Router.
 *
 * Error Code: 9013
 */
export class RouterUseScopeError extends ApplicationError {
  constructor() {
    super('errors.routerUseScopeViolation', ERROR_CODES.ROUTER.USE_SCOPE_VIOLATION)
  }
}
