import { ApplicationError, ERROR_CODES } from 'stratal/errors'

export class ContextNotInitializedError extends ApplicationError {
  constructor(contextType = 'Context') {
    super(
      'errors.contextNotInitialized',
      ERROR_CODES.AUTH.CONTEXT_NOT_INITIALIZED,
      { contextType }
    )
  }
}
