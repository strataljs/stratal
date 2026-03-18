import { Transient } from '../di/decorators'
import { DI_TOKENS } from '../di/tokens'
import type { Constructor } from '../types'
import type { Command } from './command'
import { getCommandResult, resetCommandState, setCommandInputs, setCommandQuarry } from './command-internals'
import { CommandExecutionError } from './errors/command-execution.error'
import { CommandNotFoundError } from './errors/command-not-found.error'
import { CommandError } from './errors/command.error'
import { parseSignature } from './signature-parser'
import type { CommandInput, CommandResult, ParsedSignature, Quarry } from './types'

/**
 * QuarryRegistry — edge-compatible programmatic API for running commands.
 *
 * Registered as a singleton via DI_TOKENS.Quarry.
 * Commands are auto-discovered from module providers and registered at bootstrap.
 *
 * Users should inject and type as `Quarry` (the interface), which only exposes `call()`.
 */
@Transient(DI_TOKENS.Quarry)
export class QuarryRegistry implements Quarry {
  private commands = new Map<string, Command>()
  private signatures = new Map<string, ParsedSignature>()
  private aliases = new Map<string, string>()

  /**
   * Execute a command by name with optional flat input.
   */
  async call(name: string, input?: CommandInput): Promise<CommandResult> {
    const resolvedName = this.resolveName(name)
    const command = this.commands.get(resolvedName)

    if (!command) {
      throw new CommandNotFoundError(name)
    }

    const signature = this.signatures.get(resolvedName)!
    const mergedInput = this.applyDefaults(input ?? {}, signature)

    // Validate required arguments
    for (const arg of signature.arguments) {
      if (arg.required && (mergedInput[arg.name] === undefined || mergedInput[arg.name] === null)) {
        throw new CommandError(`Missing required argument: ${arg.name}`)
      }
    }

    resetCommandState(command)
    setCommandInputs(command, mergedInput)

    try {
      const exitCode = await command.handle()
      const result = getCommandResult(command)

      if (typeof exitCode === 'number') {
        return { ...result, exitCode }
      }

      return result
    } catch (error) {
      if (error instanceof CommandError) {
        const result = getCommandResult(command)
        return {
          exitCode: result.exitCode === 0 ? 1 : result.exitCode,
          output: result.output,
          errors: [...result.errors, error.message],
        }
      }

      throw new CommandExecutionError(resolvedName, error)
    }
  }

  /**
   * Check if a command exists by name or alias.
   */
  has(name: string): boolean {
    const resolved = this.resolveName(name)
    return this.commands.has(resolved)
  }

  /**
   * Get a command instance by name or alias.
   */
  get(name: string): Command | undefined {
    const resolved = this.resolveName(name)
    return this.commands.get(resolved)
  }

  /**
   * Get all registered commands.
   */
  all(): Map<string, Command> {
    return new Map(this.commands)
  }

  /**
   * List all commands with their descriptions and aliases.
   */
  list(): { name: string; description?: string; aliases: string[] }[] {
    const result: { name: string; description?: string; aliases: string[] }[] = []

    for (const [name, command] of this.commands) {
      const commandClass = command.constructor as typeof Command
      const commandAliases: string[] = []

      for (const [alias, target] of this.aliases) {
        if (target === name) {
          commandAliases.push(alias)
        }
      }

      result.push({
        name,
        description: commandClass.description,
        aliases: commandAliases,
      })
    }

    return result.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Get auto-generated usage text for a command.
   */
  async usage(name: string): Promise<string> {
    const resolvedName = this.resolveName(name)
    const command = this.commands.get(resolvedName)

    if (!command) {
      throw new CommandNotFoundError(name)
    }

    const signature = this.signatures.get(resolvedName)!
    const commandClass = command.constructor as typeof Command

    // Dynamic import to keep usage-generator tree-shakeable
    const { generateUsage } = await import('./usage-generator')
    return generateUsage(signature, commandClass.description)
  }

  /**
   * Register a command instance with the registry.
   * @internal Called by Application during bootstrap.
   */
  register(command: Command, commandClass: Constructor): void {
    const staticCommand = commandClass as unknown as typeof Command

    if (!staticCommand.command) {
      throw new Error(`Command class ${commandClass.name} is missing static "command" signature`)
    }

    const signature = parseSignature(staticCommand.command)
    const name = signature.name

    setCommandQuarry(command, this)

    this.commands.set(name, command)
    this.signatures.set(name, signature)

    // Register aliases
    if (staticCommand.aliases) {
      for (const alias of staticCommand.aliases) {
        this.aliases.set(alias, name)
      }
    }
  }

  private resolveName(name: string): string {
    return this.aliases.get(name) ?? name
  }

  private applyDefaults(input: CommandInput, signature: ParsedSignature): CommandInput {
    const result = { ...input }

    // Apply argument defaults
    for (const arg of signature.arguments) {
      if (result[arg.name] === undefined && arg.default !== undefined) {
        result[arg.name] = arg.default
      }
    }

    // Apply option defaults
    for (const opt of signature.options) {
      if (result[opt.name] === undefined) {
        if (opt.default !== undefined) {
          result[opt.name] = opt.default
        } else if (opt.isFlag) {
          result[opt.name] = false
        }
      }
    }

    return result
  }
}
