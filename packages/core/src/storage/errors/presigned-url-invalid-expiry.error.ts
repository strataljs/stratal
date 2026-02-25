import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../errors'

export class PresignedUrlInvalidExpiryError extends ApplicationError {
  constructor(expiresIn: number, min: number, max: number) {
    super('errors.storage.presignedUrlInvalidExpiry', ERROR_CODES.VALIDATION.INVALID_FORMAT, {
      expiresIn,
      min,
      max,
    })
  }
}
