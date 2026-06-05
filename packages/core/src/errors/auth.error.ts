import { ApplicationError } from './application-error'

export class AuthError extends ApplicationError {
  constructor(message?: string, cause?: unknown) {
    super(message ?? 'Authentication error', cause)
  }
}
