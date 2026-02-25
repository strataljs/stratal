import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../infrastructure/error-handler'

/**
 * InvalidModuleProviderError
 *
 * Thrown when a module provider configuration is invalid.
 * This indicates a misconfiguration in the @Module decorator providers array.
 */
export class InvalidModuleProviderError extends ApplicationError {
  constructor(provider: unknown) {
    super(
      'errors.invalidModuleProvider',
      ERROR_CODES.SYSTEM.INVALID_MODULE_PROVIDER,
      { provider: JSON.stringify(provider) }
    )
  }
}
