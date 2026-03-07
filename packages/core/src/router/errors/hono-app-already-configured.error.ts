import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * Error thrown when HonoApp.configure() is called more than once.
 *
 * HonoApp can only be configured a single time during application bootstrap.
 */
export class HonoAppAlreadyConfiguredError extends ApplicationError {
  constructor() {
    super(
      'errors.honoAppAlreadyConfigured',
      ERROR_CODES.SYSTEM.CONFIGURATION_ERROR
    )
  }
}
