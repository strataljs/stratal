import type { $ZodError, $ZodIssue } from 'zod/v4/core';
import { HttpException } from '../../errors';

/**
 * Error thrown when a signed URL has an invalid or expired signature.
 *
 * HTTP Status: 403 Forbidden
 */
export class InvalidSignatureError extends HttpException {
  constructor() {
    super(403, 'Invalid or expired signature')
  }
}

/**
 * ResponseValidationError
 *
 * Thrown when a controller's response body does not match the declared Zod response schema.
 * Indicates a server-side schema mismatch — the controller is returning data that
 * violates its own API contract.
 */
export class ResponseValidationError extends HttpException {
  public readonly issues: { path: string; message: string; code: string }[]

  constructor(zodError: $ZodError) {
    super(500, 'Response validation failed')
    this.issues = zodError.issues.map((err: $ZodIssue) => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code,
    }))
  }
}

export { RouteNotFoundError } from './route-not-found.error';

export { SchemaValidationError } from './schema-validation.error';
