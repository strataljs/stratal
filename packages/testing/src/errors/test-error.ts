/**
 * Base error class for all test framework errors.
 * Extends from Error and allows easy identification via `instanceof`.
 */
export class TestError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'TestError'

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor)
  }
}
