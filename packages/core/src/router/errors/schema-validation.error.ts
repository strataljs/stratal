import type { $ZodError, $ZodIssue } from 'zod/v4/core'
import { HttpException } from '../../errors'

export class SchemaValidationError extends HttpException {
  public readonly issues: { path: string; message: string; code: string }[]

  constructor(zodError: $ZodError) {
    super(400, 'Schema validation failed')
    this.issues = zodError.issues.map((err: $ZodIssue) => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code,
    }))
  }

  override reportContext(): Record<string, unknown> {
    return { issues: this.issues }
  }
}
