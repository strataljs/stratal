/**
 * Thrown when a command is not found in the Quarry registry.
 */
export class CommandNotFoundError extends Error {
  constructor(name: string) {
    super(`Command "${name}" is not registered.`)
    this.name = 'CommandNotFoundError'
  }
}
