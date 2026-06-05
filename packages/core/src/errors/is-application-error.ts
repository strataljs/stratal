import { ApplicationError } from './application-error'

export function isApplicationError(error: unknown): error is ApplicationError {
  if (error instanceof ApplicationError) return true
  return error instanceof Error
    && typeof (error as ApplicationError).timestamp === 'string'
}
