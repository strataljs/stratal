import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../errors'

export class RouterAlreadyConfiguredError extends ApplicationError {
  constructor() {
    super(
      'errors.routerAlreadyConfigured',
      ERROR_CODES.SYSTEM.CONFIGURATION_ERROR,
      {}
    )
  }
}
