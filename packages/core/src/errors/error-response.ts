export type Environment = 'development' | 'staging' | 'production'

export interface ErrorResponse {
  /**
   * Numeric error code for identification and escalation
   * See error-codes.ts for the complete registry
   */
  code: number

  /**
   * Human-readable error message
   * Fixed per error type, not customizable
   */
  message: string

  /**
   * ISO timestamp when the error occurred
   */
  timestamp: string

  /**
   * Additional structured data about the error
   * Only included in development environment
   */
  metadata?: Record<string, unknown>

  /**
   * Stack trace for debugging
   * Only included in development environment
   */
  stack?: string
}

/**
 * Type guard to check if an object is an ErrorResponse
 */
export function isErrorResponse(obj: unknown): obj is ErrorResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'code' in obj &&
    typeof (obj as ErrorResponse).code === 'number' &&
    'message' in obj &&
    typeof (obj as ErrorResponse).message === 'string' &&
    'timestamp' in obj &&
    typeof (obj as ErrorResponse).timestamp === 'string'
  )
}
