import { ApplicationError, ERROR_CODES } from 'stratal/errors'

export class InvalidTokenError extends ApplicationError {
  constructor() {
    super('errors.auth.invalidToken', ERROR_CODES.AUTH.INVALID_TOKEN)
  }
}
