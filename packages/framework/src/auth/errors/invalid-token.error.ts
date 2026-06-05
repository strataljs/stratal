import { HttpException } from 'stratal/errors'

export class InvalidTokenError extends HttpException {
  constructor() { super(401, 'Invalid or expired token') }
}
