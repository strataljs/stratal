import { ApplicationError, ERROR_CODES } from '../../errors'

export class R2BindingNotFoundError extends ApplicationError {
  constructor(binding: string) {
    super('errors.storage.r2BindingNotFound', ERROR_CODES.SYSTEM.CONFIGURATION_ERROR, { binding })
  }
}
