import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../infrastructure/error-handler'

/**
 * ConditionalBindingFallbackError
 *
 * Thrown when a conditional binding predicate returns false but no fallback
 * implementation was provided and no existing registration exists for the token.
 *
 * This typically indicates a misconfiguration in the DI setup where:
 * - A `when().use().give()` chain was used without `otherwise()`
 * - AND the token wasn't previously registered
 * - AND the predicate evaluated to false at resolution time
 */
export class ConditionalBindingFallbackError extends ApplicationError {
  constructor(token: string) {
    super(
      'errors.conditionalBindingFallback',
      ERROR_CODES.SYSTEM.INFRASTRUCTURE_ERROR,
      { token }
    )
  }
}
