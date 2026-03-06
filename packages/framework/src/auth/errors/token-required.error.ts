import { ApplicationError, ERROR_CODES } from 'stratal/errors'

export class TokenRequiredError extends ApplicationError {
  constructor() {
    super('errors.auth.tokenRequired', ERROR_CODES.VALIDATION.REQUIRED_FIELD, { field: 'token' })
  }
}
