import { TestError } from './test-error'

/**
 * Error thrown when test setup fails.
 * Examples: schema creation failure, migration failure, application bootstrap failure.
 */
export class TestSetupError extends TestError {
  constructor(message: string, cause?: Error) {
    super(`Test setup failed: ${message}`, cause)
  }
}
