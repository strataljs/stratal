/**
 * Wraps unexpected errors that occur during command execution.
 */
export class CommandExecutionError extends Error {
  readonly originalError: unknown

  constructor(commandName: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    super(`Command "${commandName}" failed: ${message}`)
    this.name = 'CommandExecutionError'
    this.originalError = error
  }
}
