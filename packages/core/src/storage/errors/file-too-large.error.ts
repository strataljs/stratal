import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../errors'

export class FileTooLargeError extends ApplicationError {
  constructor(size: number, maxSize: number) {
    super('errors.storage.fileTooLarge', ERROR_CODES.VALIDATION.INVALID_FORMAT, {
      size,
      maxSize,
    })
  }
}
