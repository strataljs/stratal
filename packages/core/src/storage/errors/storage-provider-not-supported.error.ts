import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../errors'

export class StorageProviderNotSupportedError extends ApplicationError {
  constructor(provider: string) {
    super('errors.storage.providerNotSupported', ERROR_CODES.SYSTEM.CONFIGURATION_ERROR, { provider })
  }
}
