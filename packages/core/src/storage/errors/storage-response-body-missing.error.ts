import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../errors'

export class StorageResponseBodyMissingError extends ApplicationError {
  constructor(path: string) {
    super(
      'errors.storage.responseBodyMissing',
      ERROR_CODES.SYSTEM.INFRASTRUCTURE_ERROR,
      { path }
    )
  }
}
