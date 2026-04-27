import { HttpException } from 'stratal/errors'

/**
 * Thrown when the internal sub-request to fetch the background page fails
 * (e.g., non-2xx response, redirect, or empty body).
 *
 * HTTP Status: 502 Bad Gateway — the modal service acted as a proxy and the
 * upstream (background page) returned an unexpected response.
 */
export class ModalBackgroundFetchError extends HttpException {
  constructor() {
    super(502, 'modal.errors.backgroundFetchFailed')
  }
}
