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
}
