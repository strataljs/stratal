import 'reflect-metadata'

import { bold, cyan, dim, green, red, yellow } from './colors'
import { COMMAND_INTERNALS } from './constants'
import { CommandError } from './errors/command.error'
import type { CommandInput, CommandInternals, CommandResult } from './types'

/**
 * Abstract base class for Quarry commands.
 *
 * Subclasses define a static `command` signature string and implement `handle()`.
 *
 * @example
 * ```typescript
 * export class GreetCommand extends Command {
 *   static command = 'greet {name : The name to greet} {--loud}'
 *   static description = 'Greet someone'
 *
 *   async handle(): Promise<void> {
 *     const name = this.string('name')
 *     const loud = this.boolean('loud')
 *     this.info(loud ? `HELLO, ${name.toUpperCase()}!` : `Hello, ${name}!`)
 *   }
 * }
 * ```
 */
export abstract class Command {
  /**
   * Laravel-style command signature string.
   *
   * **Command names:**
   * - `'greet'` — flat command (`quarry greet`)
   * - `'task add'` — subcommand hierarchy via spaces (`quarry task add`)
   * - `'task:add'` — namespaced flat command via colons (`quarry task:add`)
   *
   * **Arguments:**
   * - `{name}` — required argument
   * - `{name?}` — optional argument
   * - `{name=default}` — argument with default value
   * - `{name*}` — array/variadic argument
   * - `{name : description}` — argument with description
   *
   * **Options:**
   * - `{--flag}` — boolean flag
   * - `{--name=}` — option that accepts a value
   * - `{--name=default}` — option with default value
   * - `{--name=*}` — array option (multiple values)
   * - `{--A|name}` — option with single-char alias
   * - `{--name= : description}` — option with description
   *
   * @example
   * ```typescript
   * // Namespaced flat command: `quarry users:create ...`
   * static command = 'users:create {email : The user email} {--A|admin} {--R|role= : Assign a role}'
   *
   * // Subcommand hierarchy: `quarry users create ...`
   * static command = 'users create {email : The user email} {--A|admin} {--R|role= : Assign a role}'
   * ```
   */
  static command: string
  /** Human-readable description */
  static description?: string
  /** Alternative command names */
  static aliases?: string[];

  [COMMAND_INTERNALS]: CommandInternals

  constructor() {
    this[COMMAND_INTERNALS] = {
      inputs: {},
      output: [],
      errors: [],
      exitCode: 0,
      quarry: null,
    }
  }

  /**
   * Implement this method with the command's logic.
   * Return a number to set the exit code, or void for exit code 0.
   */
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  abstract handle(): number | void | Promise<number | void>

  // ── Input Accessors ──────────────────────────────────────────────

  /**
   * Get an input value with generic type.
   */
  input<T>(name: string): T {
    return this[COMMAND_INTERNALS].inputs[name] as T
  }

  /**
   * Get a string input. Throws CommandError if present but not a string.
   */
  string(name: string): string {
    const value = this[COMMAND_INTERNALS].inputs[name]
    if (value === undefined || value === null) {
      return ''
    }
    if (typeof value !== 'string') {
      throw new CommandError(`Input "${name}" expected a string, got ${typeof value}`)
    }
    return value
  }

  /**
   * Get a boolean input. Throws CommandError if present but not a boolean.
   */
  boolean(name: string): boolean {
    const value = this[COMMAND_INTERNALS].inputs[name]
    if (value === undefined || value === null) {
      return false
    }
    if (typeof value !== 'boolean') {
      throw new CommandError(`Input "${name}" expected a boolean, got ${typeof value}`)
    }
    return value
  }

  /**
   * Get a number input. Coerces strings to numbers. Throws CommandError on NaN.
   */
  number(name: string): number {
    const value = this[COMMAND_INTERNALS].inputs[name]
    if (value === undefined || value === null) {
      return 0
    }
    const num = typeof value === 'string' ? Number(value) : value
    if (typeof num !== 'number' || Number.isNaN(num)) {
      throw new CommandError(`Input "${name}" expected a number, got ${typeof value}`)
    }
    return num
  }

  /**
   * Get an array input. Throws CommandError if present but not an array.
   */
  array(name: string): string[] {
    const value = this[COMMAND_INTERNALS].inputs[name]
    if (value === undefined || value === null) {
      return []
    }
    if (!Array.isArray(value)) {
      throw new CommandError(`Input "${name}" expected an array, got ${typeof value}`)
    }
    return value as string[]
  }

  // ── Output Helpers ───────────────────────────────────────────────

  /** Write an informational message to output */
  info(message: string): void {
    this[COMMAND_INTERNALS].output.push(cyan(message))
  }

  /** Write a success message to output */
  success(message: string): void {
    this[COMMAND_INTERNALS].output.push(`${green(bold('✔'))} ${green(message)}`)
  }

  /** Write a warning message to output */
  warn(message: string): void {
    this[COMMAND_INTERNALS].output.push(`${yellow(bold('⚠'))} ${yellow(message)}`)
  }

  /** Write an error message to errors */
  error(message: string): void {
    this[COMMAND_INTERNALS].errors.push(red(message))
  }

  /** Write a plain line to output */
  line(message?: string): void {
    this[COMMAND_INTERNALS].output.push(message ?? '')
  }

  /** Write an empty line to output */
  newLine(): void {
    this[COMMAND_INTERNALS].output.push('')
  }

  /** Write a comment-style line to output */
  comment(message: string): void {
    this[COMMAND_INTERNALS].output.push(dim(`// ${message}`))
  }

  /** Write a formatted table to output */
  table(headers: string[], rows: string[][]): void {
    const colWidths = headers.map((h, i) => {
      const maxRow = rows.reduce((max, row) => Math.max(max, (row[i] ?? '').length), 0)
      return Math.max(h.length, maxRow)
    })

    const formatRow = (cells: string[]) =>
      cells.map((cell, i) => cell.padEnd(colWidths[i])).join('  ')

    this[COMMAND_INTERNALS].output.push(bold(formatRow(headers)))
    this[COMMAND_INTERNALS].output.push(dim(colWidths.map((w) => '-'.repeat(w)).join('  ')))
    for (const row of rows) {
      this[COMMAND_INTERNALS].output.push(formatRow(row))
    }
  }

  /** Write an error message and set exit code */
  fail(message: string, exitCode = 1): void {
    this[COMMAND_INTERNALS].errors.push(`${red(bold('✖'))} ${red(message)}`)
    this[COMMAND_INTERNALS].exitCode = exitCode
  }

  // ── Command Calling ──────────────────────────────────────────────

  /**
   * Call another command from within this command.
   * Delegates to Quarry.call() via internal reference.
   */
  async call(name: string, input?: CommandInput): Promise<CommandResult> {
    const internals = this[COMMAND_INTERNALS]
    if (!internals.quarry) {
      throw new CommandError('Cannot call commands: Quarry reference not set')
    }
    const result = await internals.quarry.call(name, input)

    // Forward child output/errors into parent (like Clipanion context switches)
    internals.output.push(...result.output)
    internals.errors.push(...result.errors)

    return result
  }
}
