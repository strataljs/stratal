export type Environment = 'development' | 'staging' | 'production'

export interface ErrorResponse {
  message: string
  timestamp: string
  stack?: string
}

export function isErrorResponse(obj: unknown): obj is ErrorResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'message' in obj &&
    typeof (obj as ErrorResponse).message === 'string' &&
    'timestamp' in obj &&
    typeof (obj as ErrorResponse).timestamp === 'string'
  )
}
