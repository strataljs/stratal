import { HttpException } from 'stratal/errors'

/**
 * Raised when a pagination cursor cannot be read: it is not the base64url
 * payload `$cursor` mints, or it decodes to something that is not a cursor.
 *
 * This is **bad input**, not a broken query. A cursor travels in a query string,
 * so a truncated link, a hand-edited URL, or one minted by an older build all
 * land here, and the request itself is still answerable. It carries its own
 * `400`, so a handler lets it surface rather than catching it to serve the
 * first page — the same refusal any other damaged parameter gets.
 */
export class MalformedCursorError extends HttpException {
  constructor(cause?: unknown) {
    super(400, '[stratal:database] Malformed pagination cursor.', cause)
  }
}
