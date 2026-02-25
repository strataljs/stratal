import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../errors'

export class InvalidFileTypeError extends ApplicationError {
  constructor(mimeType: string) {
    super('errors.storage.invalidFileType', ERROR_CODES.VALIDATION.INVALID_FORMAT, {
      mimeType,
    })
  }
}
