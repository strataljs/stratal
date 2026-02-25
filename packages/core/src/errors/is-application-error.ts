import { ApplicationError } from './application-error'

/**
 * Type guard to check if an error is an ApplicationError
 *
 * @param error - The error to check
 * @returns True if the error is an ApplicationError instance
 */
export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError
}
