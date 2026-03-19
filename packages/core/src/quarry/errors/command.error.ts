/**
 * User-facing command error with a plain English message.
 *
 * Quarry catches this in `call()` and puts the message into `CommandResult.errors`.
 * Does NOT extend `ApplicationError` (which requires i18n keys + error codes).
 * Not routed through GlobalErrorHandler.
 */
export class CommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommandError'
  }
}
