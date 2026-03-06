import { ApplicationError, ERROR_CODES } from 'stratal/errors'

export class UserNotAuthorizedError extends ApplicationError {
  constructor() {
    super(
      'errors.unauthorized',
      ERROR_CODES.AUTHZ.FORBIDDEN
    )
  }
}
