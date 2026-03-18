import type { Command } from './command'
import { COMMAND_INTERNALS } from './constants'
import type { CommandInput, CommandInternals, CommandResult } from './types'

/** @internal Set the flat input values before calling handle() */
export function setCommandInputs(command: Command, values: CommandInput): void {
  command[COMMAND_INTERNALS].inputs = { ...values }
}

/** @internal Set the Quarry reference for this.call() support */
export function setCommandQuarry(
  command: Command,
  quarry: { call(name: string, input?: CommandInput): Promise<CommandResult> },
): void {
  command[COMMAND_INTERNALS].quarry = quarry
}

/** @internal Collect the result after handle() completes */
export function getCommandResult(command: Command): CommandResult {
  const internals: CommandInternals = command[COMMAND_INTERNALS]
  return {
    exitCode: internals.exitCode,
    output: [...internals.output],
    errors: [...internals.errors],
  }
}

/** @internal Reset state between invocations */
export function resetCommandState(command: Command): void {
  const internals: CommandInternals = command[COMMAND_INTERNALS]
  internals.inputs = {}
  internals.output = []
  internals.errors = []
  internals.exitCode = 0
}
