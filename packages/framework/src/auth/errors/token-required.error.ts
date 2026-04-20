import { ApplicationError, ERROR_CODES } from 'stratal/errors'

export class TokenRequiredError extends ApplicationError {
  constructor() {
    super('auth.errors.tokenRequired', ERROR_CODES.VALIDATION.REQUIRED_FIELD, { field: 'token' })
  }
}
