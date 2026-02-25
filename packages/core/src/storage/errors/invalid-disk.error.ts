import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../errors'

export class InvalidDiskError extends ApplicationError {
  constructor(disk: string) {
    super('errors.storage.invalidDisk', ERROR_CODES.SYSTEM.CONFIGURATION_ERROR, { disk })
  }
}
