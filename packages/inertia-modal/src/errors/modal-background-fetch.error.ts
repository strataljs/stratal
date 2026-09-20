import { HttpException } from 'stratal/errors'
import { withI18n } from 'stratal/i18n'

/**
 * Thrown when the sub-request for the page beneath a modal answers with something the chain cannot
 * be built from — a non-2xx, a redirect, an empty body, a body that is not a page, or a level of a
 * shape this build cannot read.
 *
 * `cause` carries the parse failure where there was one. The status this reports is a property of
 * the exchange, not of the reason, so every one of those answers the caller identically; a `base`
 * pointing at a route that does not render a page is still a mistake someone has to find, and the
 * reason is the only thing that says which mistake it was.
 *
 * HTTP Status: 502 Bad Gateway — this service acted as a proxy and the upstream answered
 * unexpectedly.
 */
export class ModalBackgroundFetchError extends HttpException {
  constructor(cause?: unknown) {
    super(502, withI18n('modal.errors.backgroundFetchFailed'), cause)
  }
}
