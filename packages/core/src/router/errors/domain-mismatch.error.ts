import { HttpException } from '../../errors/http-exception'

/**
 * Error thrown when a request's host header does not match the expected domain pattern.
 *
 * HTTP Status: 404 Not Found
 */
export class DomainMismatchError extends HttpException {
  constructor() {
    super(404, 'errors.domainMismatch')
  }
}
