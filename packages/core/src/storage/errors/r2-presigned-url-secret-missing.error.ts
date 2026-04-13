import { ApplicationError, ERROR_CODES } from '../../errors'

export class R2PresignedUrlSecretMissingError extends ApplicationError {
  constructor() {
    super('errors.storage.r2PresignedUrlSecretMissing', ERROR_CODES.SYSTEM.CONFIGURATION_ERROR)
  }
}
