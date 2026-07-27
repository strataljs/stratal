export class ApplicationError extends Error {
  public readonly timestamp: string

  constructor(message?: string, cause?: unknown) {
    super(message ?? 'Internal Server Error', cause !== undefined ? { cause } : undefined)

    Object.setPrototypeOf(this, new.target.prototype)

    this.name = this.constructor.name
    this.timestamp = new Date().toISOString()

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- captureStackTrace is V8-specific, not always present
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Extra structured fields this error contributes to its log entry.
   *
   * Override in a subclass to surface error-specific detail (codes, identifiers,
   * validation issues) to observability. Returns `undefined` by default. Reserved
   * log keys (`message`, `name`, `stack`, `timestamp`, `cause`) cannot be
   * overridden — `cause` is populated from the error's cause chain — and
   * globally-registered context still takes precedence over these fields.
   */
  public reportContext(): Record<string, unknown> | undefined {
    return undefined
  }
}
