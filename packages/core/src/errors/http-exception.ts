import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ApplicationError } from './application-error'

export const HTTP_STATUS_MESSAGES: Partial<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Content Too Large',
  422: 'Unprocessable Entity',
  423: 'Locked',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
}

export class HttpException extends ApplicationError {
  public readonly httpStatus: ContentfulStatusCode

  constructor(httpStatus: ContentfulStatusCode, message?: string, cause?: unknown) {
    super(message ?? HTTP_STATUS_MESSAGES[httpStatus] ?? 'Internal Server Error', cause)
    this.httpStatus = httpStatus
  }
}

export function abort(
  status: ContentfulStatusCode,
  message?: string,
): never {
  throw new HttpException(status, message)
}
