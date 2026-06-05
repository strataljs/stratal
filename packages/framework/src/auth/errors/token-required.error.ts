import { HttpException } from 'stratal/errors'

export class TokenRequiredError extends HttpException {
  constructor() { super(401, 'Verification token is required') }
}
