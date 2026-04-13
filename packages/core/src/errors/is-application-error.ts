import { ApplicationError } from './application-error'

/**
 * Type guard to check if an error is an ApplicationError.
 *
 * Uses `instanceof` first, then falls back to a structural check
 * for the `code` and `timestamp` properties that all ApplicationError
 * instances have. This handles cross-module boundary cases where
 * `instanceof` fails due to duplicate class identities (e.g., Vite's
 * module graph in workerd).
 *
 * @param error - The error to check
 * @returns True if the error is an ApplicationError instance
 */
export function isApplicationError(error: unknown): error is ApplicationError {
  if (error instanceof ApplicationError) return true
  return error instanceof Error
    && typeof (error as ApplicationError).code === 'number'
    && typeof (error as ApplicationError).timestamp === 'string'
}
