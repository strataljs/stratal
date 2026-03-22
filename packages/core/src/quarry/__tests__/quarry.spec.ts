import 'reflect-metadata'

import { container as tsyringeRootContainer, type DependencyContainer } from 'tsyringe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from '../../di/container'
import { DI_TOKENS } from '../../di/tokens'
import { Command } from '../command'
import { CommandNotFoundError } from '../errors/command-not-found.error'
import { CommandError } from '../errors/command.error'
import { QuarryRegistry } from '../quarry-registry'

class GreetCommand extends Command {
  static command = 'greet {name : The name} {--loud}'
  static description = 'Greet someone'
  static aliases = ['g', 'hello']

  handle(): Promise<undefined> {
    const name = this.string('name')
    const loud = this.boolean('loud')
    this.info(loud ? `HELLO, ${name.toUpperCase()}!` : `Hello, ${name}!`)
    return Promise.resolve(undefined)
  }
}

class FailCommand extends Command {
  static command = 'fail'
  static description = 'A command that fails'

  handle(): Promise<number> {
    this.error('Something went wrong')
    return Promise.resolve(1)
  }
}

class ErrorCommand extends Command {
  static command = 'error'

  handle(): Promise<never> {
    throw new CommandError('User-facing error')
  }
}

class CrashCommand extends Command {
  static command = 'crash'

  handle(): Promise<never> {
    throw new Error('Unexpected crash')
  }
}

class AppErrorCommand extends Command {
  static command = 'app-error'

  handle(): Promise<never> {
    throw new Error('errors.someAppError')
  }
}

class DefaultsCommand extends Command {
  static command = 'defaults {name=World} {--greeting=Hello}'

  handle(): Promise<undefined> {
    const name = this.string('name')
    const greeting = this.string('greeting')
    this.info(`${greeting}, ${name}!`)
    return Promise.resolve(undefined)
  }
}

class CallerCommand extends Command {
  static command = 'caller'

  async handle(): Promise<undefined> {
    const result = await this.call('greet', { name: 'Inner' })
    this.info(`Inner result: ${result.output.join(', ')}`)
    return undefined
  }
}

describe('QuarryRegistry', () => {
  let quarry: QuarryRegistry
  let childContainer: DependencyContainer
  let container: Container

  const mockErrorHandler = {
    handle: vi.fn((error: unknown) => ({
      code: 9999,
      message: error instanceof Error ? `handled:${error.message}` : 'handled:unknown',
      timestamp: new Date().toISOString(),
    })),
  }

  beforeEach(() => {
    childContainer = tsyringeRootContainer.createChildContainer()
    container = new Container({
      container: childContainer,
    })
    container.registerValue(DI_TOKENS.ErrorHandler, mockErrorHandler)
    quarry = new QuarryRegistry(container)
    mockErrorHandler.handle.mockClear()
  })

  function registerAll(): void {
    quarry.register(GreetCommand)
    quarry.register(FailCommand)
    quarry.register(ErrorCommand)
    quarry.register(CrashCommand)
    quarry.register(AppErrorCommand)
    quarry.register(DefaultsCommand)
    quarry.register(CallerCommand)
  }

  // ── register & has ──────────────────────────────────────────────

  it('should register a command and check existence', () => {
    quarry.register(GreetCommand)
    expect(quarry.has('greet')).toBe(true)
    expect(quarry.has('unknown')).toBe(false)
  })

  it('should resolve aliases', () => {
    quarry.register(GreetCommand)
    expect(quarry.has('g')).toBe(true)
    expect(quarry.has('hello')).toBe(true)
  })

  it('should throw for duplicate command name', () => {
    quarry.register(GreetCommand)
    expect(() => quarry.register(GreetCommand)).toThrow('Duplicate command name: "greet"')
  })

  it('should throw for alias conflicting with existing command name', () => {
    class AliasConflict extends Command {
      static command = 'other'
      static aliases = ['greet']
      handle(): Promise<undefined> { return Promise.resolve(undefined) }
    }

    quarry.register(GreetCommand)
    expect(() => quarry.register(AliasConflict)).toThrow('Duplicate alias: "greet" conflicts with an existing command or alias')
  })

  it('should throw for alias conflicting with existing alias', () => {
    class AliasConflict extends Command {
      static command = 'other'
      static aliases = ['g']
      handle(): Promise<undefined> { return Promise.resolve(undefined) }
    }

    quarry.register(GreetCommand)
    expect(() => quarry.register(AliasConflict)).toThrow('Duplicate alias: "g" conflicts with an existing command or alias')
  })

  it('should not leave command registered when alias conflicts', () => {
    quarry.register(GreetCommand)

    class AliasConflict extends Command {
      static command = 'other'
      static aliases = ['fresh-alias', 'g'] // 'g' conflicts with GreetCommand alias
      handle(): Promise<undefined> { return Promise.resolve(undefined) }
    }

    expect(() => quarry.register(AliasConflict)).toThrow('Duplicate alias')
    // 'other' should NOT be in the registry since its alias validation failed
    expect(quarry.has('other')).toBe(false)
    // 'fresh-alias' should also not be registered
    expect(quarry.has('fresh-alias')).toBe(false)
  })

  it('should throw for missing static command signature', () => {
    class NoSignature extends Command {
      handle(): Promise<undefined> { return Promise.resolve(undefined) }
    }

    expect(() => quarry.register(NoSignature)).toThrow('missing static "command" signature')
  })

  // ── call ────────────────────────────────────────────────────────

  it('should call a command and return result', async () => {
    registerAll()
    const result = await quarry.call('greet', { name: 'World' })
    expect(result.exitCode).toBe(0)
    expect(result.output).toEqual(['Hello, World!'])
    expect(result.errors).toEqual([])
  })

  it('should call a command via alias', async () => {
    registerAll()
    const result = await quarry.call('g', { name: 'Alias' })
    expect(result.output).toEqual(['Hello, Alias!'])
  })

  it('should pass options to command', async () => {
    registerAll()
    const result = await quarry.call('greet', { name: 'World', loud: true })
    expect(result.output).toEqual(['HELLO, WORLD!'])
  })

  it('should return exit code from handle()', async () => {
    registerAll()
    const result = await quarry.call('fail')
    expect(result.exitCode).toBe(1)
    expect(result.errors).toEqual(['Something went wrong'])
  })

  it('should apply argument defaults', async () => {
    registerAll()
    const result = await quarry.call('defaults')
    expect(result.output).toEqual(['Hello, World!'])
  })

  it('should apply option defaults', async () => {
    registerAll()
    const result = await quarry.call('defaults', { name: 'Alice' })
    expect(result.output).toEqual(['Hello, Alice!'])
  })

  it('should override defaults with provided input', async () => {
    registerAll()
    const result = await quarry.call('defaults', { name: 'Bob', greeting: 'Hi' })
    expect(result.output).toEqual(['Hi, Bob!'])
  })

  // ── Error Handling ──────────────────────────────────────────────

  it('should throw CommandNotFoundError for unknown command', async () => {
    await expect(quarry.call('unknown')).rejects.toThrow(CommandNotFoundError)
  })

  it('should catch CommandError and put message in errors', async () => {
    registerAll()
    const result = await quarry.call('error')
    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('User-facing error')
  })

  it('should handle unexpected errors through GlobalErrorHandler', async () => {
    registerAll()
    const result = await quarry.call('crash')
    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('handled:Unexpected crash')
    expect(mockErrorHandler.handle).toHaveBeenCalledOnce()
  })

  it('should route ApplicationError through GlobalErrorHandler', async () => {
    registerAll()
    mockErrorHandler.handle.mockReturnValueOnce({
      code: 9999,
      message: 'Translated app error',
      timestamp: new Date().toISOString(),
    })
    const result = await quarry.call('app-error')
    expect(result.exitCode).toBe(1)
    expect(result.errors).toContain('Translated app error')
    expect(mockErrorHandler.handle).toHaveBeenCalledOnce()
  })

  it('should not re-throw for unexpected errors', async () => {
    registerAll()
    const result = await quarry.call('crash')
    expect(result.exitCode).toBe(1)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('should throw CommandError for missing required argument', async () => {
    registerAll()
    await expect(quarry.call('greet')).rejects.toThrow(CommandError)
    await expect(quarry.call('greet')).rejects.toThrow('Missing required argument: name')
  })

  // ── this.call() delegation ──────────────────────────────────────

  it('should allow commands to call other commands via this.call()', async () => {
    registerAll()
    const result = await quarry.call('caller')
    expect(result.output).toEqual(['Hello, Inner!', 'Inner result: Hello, Inner!'])
  })

  // ── get, all, list ──────────────────────────────────────────────

  it('should get a command constructor by name', () => {
    registerAll()
    expect(quarry.get('greet')).toBe(GreetCommand)
    expect(quarry.get('unknown')).toBeUndefined()
  })

  it('should get a command constructor by alias', () => {
    registerAll()
    expect(quarry.get('g')).toBe(GreetCommand)
  })

  it('should return all commands', () => {
    registerAll()
    const all = quarry.all()
    expect(all.size).toBe(7)
    expect(all.has('greet')).toBe(true)
  })

  it('should list commands sorted by name', () => {
    registerAll()
    const list = quarry.list()
    expect(list.length).toBe(7)
    // Should be sorted alphabetically
    const names = list.map((c) => c.name)
    expect(names).toEqual([...names].sort())
  })

  it('should include aliases in list', () => {
    registerAll()
    const list = quarry.list()
    const greet = list.find((c) => c.name === 'greet')
    expect(greet?.aliases).toEqual(expect.arrayContaining(['g', 'hello']))
  })

  it('should include description in list', () => {
    registerAll()
    const list = quarry.list()
    const greet = list.find((c) => c.name === 'greet')
    expect(greet?.description).toBe('Greet someone')
  })

  // ── usage ───────────────────────────────────────────────────────

  it('should generate usage text', async () => {
    registerAll()
    const usage = await quarry.usage('greet')
    expect(usage).toContain('Usage: quarry greet')
    expect(usage).toContain('Greet someone')
    expect(usage).toContain('name')
    expect(usage).toContain('--loud')
  })

  it('should throw for usage of unknown command', async () => {
    await expect(quarry.usage('unknown')).rejects.toThrow(CommandNotFoundError)
  })

  // ── resetState between calls ────────────────────────────────────

  it('should reset command state between calls', async () => {
    registerAll()
    const result1 = await quarry.call('greet', { name: 'First' })
    const result2 = await quarry.call('greet', { name: 'Second' })

    expect(result1.output).toEqual(['Hello, First!'])
    expect(result2.output).toEqual(['Hello, Second!'])
  })
})
