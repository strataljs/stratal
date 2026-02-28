import { ApplicationError, ERROR_CODES } from '../../errors';
import type { ZodError } from '../../i18n/validation';
import { type z } from '../../i18n/validation';
/**
 * SchemaValidationError
 *
 * Thrown when Zod schema validation fails
 */
export class SchemaValidationError extends ApplicationError {
  constructor(zodError: ZodError) {
    const issues = zodError.issues.map((err: z.core.$ZodIssue) => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code
    }))

    super(
      'errors.schemaValidation',
      ERROR_CODES.VALIDATION.SCHEMA_VALIDATION,
      { issues }
    )
  }
}
