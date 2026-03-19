/**
 * Flat input object for programmatic command invocation.
 */
export type CommandInput = Record<string, unknown>

/**
 * Result of a command execution.
 */
export interface CommandResult {
  exitCode: number
  output: string[]
  errors: string[]
}

/**
 * User-facing Quarry interface. Only exposes the `call()` method.
 *
 * Inject via `@inject(DI_TOKENS.Quarry)` and type as `Quarry`.
 */
export interface Quarry {
  call(name: string, input?: CommandInput): Promise<CommandResult>
}

/**
 * Internal mutable state stored on Command instances via Symbol key.
 * @internal
 */
export interface CommandInternals {
  inputs: CommandInput
  output: string[]
  errors: string[]
  exitCode: number
  quarry: Quarry | null
}

/**
 * A parsed argument from a Laravel-style signature string.
 */
export interface ParsedArgument {
  name: string
  required: boolean
  default?: string
  description?: string
  isArray: boolean
}

/**
 * A parsed option from a Laravel-style signature string.
 */
export interface ParsedOption {
  name: string
  alias?: string
  isFlag: boolean
  isArray: boolean
  default?: string
  description?: string
}

/**
 * Fully parsed command signature.
 */
export interface ParsedSignature {
  name: string
  arguments: ParsedArgument[]
  options: ParsedOption[]
}
