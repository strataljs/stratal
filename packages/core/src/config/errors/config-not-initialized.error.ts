import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../errors'

/**
 * ConfigNotInitializedError
 *
 * Thrown when attempting to access ConfigService before it has been initialized.
 * This typically indicates that ConfigModule's onInitialize hook hasn't run yet,
 * or the module wasn't registered properly.
 */
export class ConfigNotInitializedError extends ApplicationError {
  constructor() {
    super(
      'errors.configNotInitialized',
      ERROR_CODES.SYSTEM.CONFIG_NOT_INITIALIZED
    )
  }
}
