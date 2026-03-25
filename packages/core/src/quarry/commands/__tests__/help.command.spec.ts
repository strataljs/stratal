import 'reflect-metadata'

import { container as tsyringeRootContainer, injectable } from 'tsyringe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from '../../../di/container'
import { DI_TOKENS } from '../../../di/tokens'
import { Command } from '../../command'
import { getCommandResult, setCommandInputs, setCommandQuarry } from '../../command-internals'
import { QuarryRegistry } from '../../quarry-registry'
import { HelpCommand } from '../help.command'

let childContainer: Container
let quarry: QuarryRegistry

class GreetCommand extends Command {
  static command = 'greet {name?}'
  static description = 'Greet someone'
  handle(): void {
    this.info(`Hello, ${this.string('name') || 'World'}!`)
  }
}

beforeEach(() => {
  const tsyringe = tsyringeRootContainer.createChildContainer()
  childContainer = new Container({ container: tsyringe })
  childContainer.registerValue(DI_TOKENS.ExceptionHandler, { handle: (e: unknown) => ({ message: String(e) }) })
  quarry = new QuarryRegistry(childContainer)

  childContainer.registerValue(DI_TOKENS.Quarry, quarry)

  // Apply @injectable() so tsyringe knows the constructor params
  injectable()(HelpCommand)
  childContainer.register(HelpCommand, HelpCommand)
})

function createHelp(input: Record<string, unknown> = {}): HelpCommand {
  const cmd = childContainer.resolve<HelpCommand>(HelpCommand)
  setCommandQuarry(cmd, quarry)
  setCommandInputs(cmd, input)
  return cmd
}

describe('HelpCommand', () => {
  it('should list all commands when no command argument is given', async () => {
    quarry.register(HelpCommand)
    quarry.register(GreetCommand)

    const cmd = createHelp()
    const exitCode = await cmd.handle()
    const result = getCommandResult(cmd)

    expect(exitCode).toBe(0)
    const output = result.output.join('\n')
    expect(output).toContain('help')
    expect(output).toContain('greet')
  })

  it('should show usage for a specific command', async () => {
    quarry.register(HelpCommand)
    quarry.register(GreetCommand)

    const cmd = createHelp({ command: 'greet' })
    const exitCode = await cmd.handle()
    const result = getCommandResult(cmd)

    expect(exitCode).toBe(0)
    expect(result.output.join('\n')).toContain('greet')
  })

  it('should return exit code 1 for unknown command', async () => {
    quarry.register(HelpCommand)

    const cmd = createHelp({ command: 'nonexistent' })
    const exitCode = await cmd.handle()
    const result = getCommandResult(cmd)

    expect(exitCode).toBe(1)
    expect(result.errors.join('\n')).toContain('Unknown command: nonexistent')
  })

  it('should re-throw non-CommandNotFoundError errors', async () => {
    quarry.register(HelpCommand)

    vi.spyOn(quarry, 'usage').mockRejectedValue(new Error('unexpected'))

    const cmd = createHelp({ command: 'broken' })
    await expect(cmd.handle()).rejects.toThrow('unexpected')
  })

  it('should have "list" as an alias', () => {
    expect(HelpCommand.aliases).toContain('list')
  })

  it('should have the correct signature', () => {
    expect(HelpCommand.command).toBe('help {command?}')
  })
})
