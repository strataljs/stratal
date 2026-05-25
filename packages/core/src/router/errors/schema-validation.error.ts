import { HttpException } from '../../errors'
import type { ZodError } from '../../i18n/validation'
import { type z } from '../../i18n/validation'

export class SchemaValidationError extends HttpException {
  public readonly issues: { path: string; message: string; code: string }[]

  constructor(zodError: ZodError) {
    super(400, 'Schema validation failed')
    this.issues = zodError.issues.map((err: z.core.$ZodIssue) => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code,
    }))
  }
}
