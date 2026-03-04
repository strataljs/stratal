import { ApplicationError, ERROR_CODES } from 'stratal/errors'

export class UserNotAuthenticatedError extends ApplicationError {
  constructor() {
    super(
      'errors.userNotAuthenticated',
      ERROR_CODES.AUTH.USER_NOT_AUTHENTICATED
    )
  }
}
