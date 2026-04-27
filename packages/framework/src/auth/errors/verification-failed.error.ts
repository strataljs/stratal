import { ApplicationError, ERROR_CODES } from 'stratal/errors'

export class VerificationFailedError extends ApplicationError {
  constructor() {
    super('auth.errors.verificationFailed', ERROR_CODES.AUTH.INVALID_CREDENTIALS)
  }
}
