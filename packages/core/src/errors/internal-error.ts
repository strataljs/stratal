import { ApplicationError } from './application-error'

export class InternalError extends ApplicationError {
  constructor(cause?: unknown) {
    super('Internal Server Error', cause)
  }
}
