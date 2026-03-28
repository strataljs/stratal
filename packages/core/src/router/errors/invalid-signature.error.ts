import { HttpException } from '../../errors/http-exception'

/**
 * Error thrown when a signed URL has an invalid or expired signature.
 *
 * HTTP Status: 403 Forbidden
 */
export class InvalidSignatureError extends HttpException {
  constructor() {
    super(403, 'errors.invalidSignature')
  }
}
