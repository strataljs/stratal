import { HttpException } from 'stratal/errors'

export class UserNotAuthenticatedError extends HttpException {
  constructor() { super(401, 'User is not authenticated') }
}
