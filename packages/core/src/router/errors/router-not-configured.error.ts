import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../errors'

export class RouterNotConfiguredError extends ApplicationError {
  constructor() {
    super(
      'errors.routerNotConfigured',
      ERROR_CODES.SYSTEM.CONFIGURATION_ERROR,
      {}
    )
  }
}
