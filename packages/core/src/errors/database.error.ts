import { ApplicationError } from './application-error'

export class DatabaseError extends ApplicationError {
  constructor(message?: string, cause?: unknown) {
    super(message ?? 'Database error', cause)
  }
}
