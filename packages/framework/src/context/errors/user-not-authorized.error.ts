import { HttpException } from 'stratal/errors'

export class UserNotAuthorizedError extends HttpException {
  constructor() { super(403, 'Unauthorized') }
}
