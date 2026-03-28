import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * Thrown when a required environment variable is not set.
 *
 * Maps to HTTP 500 via error code range (9xxx → 500).
 */
export class MissingEnvironmentVariableError extends ApplicationError {
  constructor(variable: string) {
    super('errors.missingEnvironmentVariable', ERROR_CODES.SYSTEM.MISSING_ENVIRONMENT_VARIABLE, {
      variable,
    })
  }
}
