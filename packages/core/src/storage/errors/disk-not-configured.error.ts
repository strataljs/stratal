import { ApplicationError, ERROR_CODES } from '../../errors'

export class DiskNotConfiguredError extends ApplicationError {
  constructor(disk: string) {
    super('errors.storage.diskNotConfigured', ERROR_CODES.SYSTEM.CONFIGURATION_ERROR, { disk })
  }
}
