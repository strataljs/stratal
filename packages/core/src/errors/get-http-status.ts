import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ERROR_CODES } from './error-codes'

/**
 * Maps error codes to HTTP status codes
 *
 * This utility is used by the frontend to set appropriate HTTP status codes
 * when returning errors from API routes.
 *
 * @param code - Numeric error code from ERROR_CODES registry
 * @returns HTTP status code (200-599)
 */
export function getHttpStatus(code: number): ContentfulStatusCode {
  // Validation errors (1000-1999) → 400 Bad Request
  if (code >= 1000 && code < 2000) {
    return 400
  }

  // Database errors (2000-2999)
  if (code >= 2000 && code < 3000) {
    // Record not found → 404
    if (code === ERROR_CODES.DATABASE.RECORD_NOT_FOUND) return 404
    // Unique constraint / conflict → 409
    if (code === ERROR_CODES.DATABASE.UNIQUE_CONSTRAINT) return 409
    // Other database errors → 500
    return 500
  }

  // Authentication errors (3000-3099) → 401 Unauthorized
  if (code >= 3000 && code < 3100) {
    return 401
  }

  // Authorization errors (3100-3199) → 403 Forbidden
  if (code >= 3100 && code < 3200) {
    return 403
  }

  // Resource not found (4000-4099) → 404 Not Found
  if (code >= 4000 && code < 4100) {
    return 404
  }

  // Resource conflict (4100-4199) → 409 Conflict
  if (code >= 4100 && code < 4200) {
    return 409
  }

  // Business logic errors (5000-5999)
  if (code >= 5000 && code < 6000) {
    // Domain-specific NOT_FOUND errors → 404
    // 5000: NOTES.NOT_FOUND
    // 5100: USERS.NOT_FOUND
    // 5200: APPLICATIONS.NOT_FOUND
    if (code === 5000 || code === 5100 || code === 5200) {
      return 404
    }
    // Other business logic errors → 422 Unprocessable Entity
    return 422
  }

  // System errors (9000-9999) → 500 Internal Server Error
  if (code >= 9000) {
    return 500
  }

  // Default to 500 for unknown codes
  return 500
}
