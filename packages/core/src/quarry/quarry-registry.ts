import { inject } from '../di'
import type { Container } from '../di/container'
import { getContainer } from '../di/container-storage'
import { Singleton } from '../di/decorators'
import { DI_TOKENS } from '../di/tokens'
import { createCliExceptionContext } from '../errors/exception-context'
import type { ExceptionHandler } from '../errors/exception-handler'
import type { Constructor } from '../types'
import { type Command } from './command'
import { getCommandResult, setCommandInputs, setCommandQuarry } from './command-internals'
import { CommandNotFoundError } from './errors/command-not-found.error'
import { CommandError } from './errors/command.error'
import { parseSignature } from './signature-parser'
import type { CommandInput, CommandResult, ParsedSignature, Quarry } from './types'

/**
 * QuarryRegistry — edge-compatible programmatic API for running commands.
 *
 * Registered as a singleton via DI_TOKENS.Quarry.
 * Commands are auto-discovered from module providers and registered at bootstrap.
 * Command constructors are stored at bootstrap; fresh instances are resolved per `call()`.
 *
 * Users should inject and type as `Quarry` (the interface), which only exposes `call()`.
 */
@Singleton(DI_TOKENS.Quarry)
export class QuarryRegistry implements Quarry {
  private commands = new Map<string, Constructor<Command>>()
  private signatures = new Map<string, ParsedSignature>()
  private aliases = new Map<string, string>()

  constructor(@inject(DI_TOKENS.Container) private readonly container: Container) { }

  /**
   * Execute a command by name with optional flat input.
   * A fresh command instance is resolved from the container per invocation.
   */
  async call(name: string, input?: CommandInput): Promise<CommandResult> {
    const resolvedName = this.resolveName(name)
    const CommandClass = this.commands.get(resolvedName)

    if (!CommandClass) {
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

    let command: Command | undefined

    try {
      // Resolve from the active request scope (handleCommand runs call() inside
      // runInRequestScope), not the global container — commands may inject
      // request-scoped providers (e.g. @InjectQueue → QueueRegistry).
      command = getContainer().resolve<Command>(CommandClass)

      setCommandQuarry(command, this)
      setCommandInputs(command, mergedInput)

      const exitCode = await command.handle()
      const result = getCommandResult(command)

      if (typeof exitCode === 'number') {
        return { ...result, exitCode }
      }

      return result
    } catch (error) {
      if (error instanceof CommandError) {
        if (command) {
          const result = getCommandResult(command)
          return {
            exitCode: result.exitCode === 0 ? 1 : result.exitCode,
            output: result.output,
            errors: [...result.errors, error.message],
          }
        }
        return { exitCode: 1, output: [], errors: [error.message] }
      }

      const errorMessage = this.handleError(error, resolvedName)

      if (command) {
        const result = getCommandResult(command)
        return {
          exitCode: result.exitCode === 0 ? 1 : result.exitCode,
          output: result.output,
          errors: [...result.errors, errorMessage],
        }
      }
      return { exitCode: 1, output: [], errors: [errorMessage] }
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
   * Get a command constructor by name or alias.
   */
  get(name: string): Constructor<Command> | undefined {
    const resolved = this.resolveName(name)
    return this.commands.get(resolved)
  }

  /**
   * Get all registered command constructors.
   */
  all(): Map<string, Constructor<Command>> {
    return new Map(this.commands)
  }

  /**
   * List all commands with their descriptions and aliases.
   */
  list(): { name: string; description?: string; aliases: string[] }[] {
    const result: { name: string; description?: string; aliases: string[] }[] = []

    for (const [name, CommandClass] of this.commands) {
      const staticCommand = CommandClass as unknown as typeof Command
      const commandAliases: string[] = []

      for (const [alias, target] of this.aliases) {
        if (target === name) {
          commandAliases.push(alias)
        }
      }

      result.push({
        name,
        description: staticCommand.description,
        aliases: commandAliases,
      })
    }

    return result.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Generate a compact listing of all commands with visual hierarchy and colors.
   */
  async listUsage(options?: { binaryName?: string; binaryLabel?: string; binaryVersion?: string }): Promise<string> {
    const commands = this.list()

    // Dynamic import to keep usage-generator tree-shakeable
    const { generateListing } = await import('./usage-generator')
    return generateListing(commands, this.signatures, options)
  }

  /**
   * Get auto-generated usage text for a command.
   */
  async usage(name: string): Promise<string> {
    const resolvedName = this.resolveName(name)
    const CommandClass = this.commands.get(resolvedName)

    if (!CommandClass) {
      throw new CommandNotFoundError(name)
    }

    const signature = this.signatures.get(resolvedName)!
    const staticCommand = CommandClass as unknown as typeof Command

    // Dynamic import to keep usage-generator tree-shakeable
    const { generateUsage } = await import('./usage-generator')
    return generateUsage(signature, staticCommand.description)
  }

  /**
   * Register a command constructor with the registry.
   * @internal Called by Application during bootstrap.
   */
  register(commandClass: Constructor<Command>): void {
    const staticCommand = commandClass as unknown as typeof Command

    if (!staticCommand.command) {
      throw new CommandError(`Command class ${commandClass.name} is missing static "command" signature`)
    }

    const signature = parseSignature(staticCommand.command)
    const name = signature.name

    if (this.commands.has(name) || this.aliases.has(name)) {
      throw new CommandError(`Duplicate command name: "${name}" is already registered`)
    }

    // Validate all aliases before any mutation
    if (staticCommand.aliases) {
      for (const alias of staticCommand.aliases) {
        if (this.commands.has(alias) || this.aliases.has(alias)) {
          throw new CommandError(`Duplicate alias: "${alias}" conflicts with an existing command or alias`)
        }
      }
    }

    // All checks passed — safe to mutate
    this.commands.set(name, commandClass)
    this.signatures.set(name, signature)

    if (staticCommand.aliases) {
      for (const alias of staticCommand.aliases) {
        this.aliases.set(alias, name)
      }
    }
  }

  private handleError(error: unknown, commandName: string): string {
    const handler = this.container.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
    const ctx = createCliExceptionContext(commandName)
    // Fire-and-forget — reporting happens via waitUntil internally
    void handler.handle(error, ctx)
    return error instanceof Error ? error.message : String(error)
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
