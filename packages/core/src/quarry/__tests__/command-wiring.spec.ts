import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import type { DependencyContainer } from 'tsyringe'
import { inject, container as tsyringeRootContainer } from 'tsyringe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Transient } from '../../di'
import { Container } from '../../di/container'
import { Scope } from '../../di/types'
import type { LoggerService } from '../../logger/services/logger.service'
import { ModuleRegistry } from '../../module/module-registry'
import { Module } from '../../module/module.decorator'
import { Command } from '../command'
import { isCommand } from '../is-command'
import { QuarryRegistry } from '../quarry'

describe('Command Auto-Wiring (Application-level)', () => {
  let childContainer: DependencyContainer
  let container: Container
  let mockLogger: DeepMocked<LoggerService>
  let registry: ModuleRegistry

  beforeEach(() => {
    vi.clearAllMocks()
    childContainer = tsyringeRootContainer.createChildContainer()
    container = new Container({
      container: childContainer,
    })
    mockLogger = createMock<LoggerService>()
    registry = new ModuleRegistry(container, mockLogger as unknown as LoggerService)
  })

  it('should detect command classes via isCommand()', () => {
    class MyCommand extends Command {
      static command = 'my:command'
      handle(): Promise<undefined> { return Promise.resolve(undefined) }
    }

    expect(isCommand(MyCommand)).toBe(true)
  })

  it('should not detect non-command classes', () => {
    class RegularService {
      getValue() { return 'value' }
    }

    expect(isCommand(RegularService)).toBe(false)
  })

  it('should collect bare class commands from providers', () => {
    class MyCommand extends Command {
      static command = 'my:command'
      handle(): Promise<undefined> { return Promise.resolve(undefined) }
    }

    @Module({ providers: [MyCommand] })
    class TestModule { }

    registry.register(TestModule)

    expect(registry.getAllCommands()).toContain(MyCommand)
  })

  it('should collect ClassProvider commands', () => {
    const CMD_TOKEN = Symbol('CmdToken')

    class MyCommand extends Command {
      static command = 'my:command'
      handle(): Promise<undefined> { return Promise.resolve(undefined) }
    }

    @Module({
      providers: [
        { provide: CMD_TOKEN, useClass: MyCommand, scope: Scope.Singleton },
      ],
    })
    class TestModule { }

    registry.register(TestModule)

    expect(registry.getAllCommands()).toContain(MyCommand)
  })

  it('should not collect non-command providers', () => {
    class RegularService { }

    @Module({ providers: [RegularService] })
    class TestModule { }

    registry.register(TestModule)

    expect(registry.getAllCommands()).toHaveLength(0)
  })

  it('should re-register command as singleton', () => {
    class MyCommand extends Command {
      static command = 'my:command'
      handle(): Promise<undefined> { return Promise.resolve(undefined) }
    }

    @Module({ providers: [MyCommand] })
    class TestModule { }

    registry.register(TestModule)

    const instance1 = container.resolve(MyCommand)
    const instance2 = container.resolve(MyCommand)
    expect(instance1).toBe(instance2)
  })

  it('should wire commands with Quarry', () => {
    class GreetCommand extends Command {
      static command = 'greet {name}'
      static description = 'Greet someone'

      handle(): Promise<undefined> {
        this.info(`Hello, ${this.string('name')}!`)
        return Promise.resolve(undefined)
      }
    }

    @Module({ providers: [GreetCommand] })
    class TestModule { }

    registry.register(TestModule)

    const quarry = new QuarryRegistry()
    const commands = registry.getAllCommands()
    expect(commands).toHaveLength(1)

    for (const CommandClass of commands) {
      const instance = container.resolve(CommandClass) as Command
      quarry.register(instance, CommandClass)
    }

    expect(quarry.has('greet')).toBe(true)
  })

  it('should handle command with injected dependencies', async () => {
    const SERVICE_TOKEN = Symbol('TestService')

    class TestService {
      getValue() { return 'injected-value' }
    }

    container.register(SERVICE_TOKEN, TestService, Scope.Singleton)

    @Transient()
    class DependentCommand extends Command {
      static command = 'dependent'

      constructor(@inject(SERVICE_TOKEN) readonly service: TestService) {
        super()
      }

      handle(): Promise<undefined> {
        this.info(this.service.getValue())
        return Promise.resolve(undefined)
      }
    }

    @Module({ providers: [DependentCommand] })
    class TestModule { }

    registry.register(TestModule)

    const quarry = new QuarryRegistry()
    for (const CommandClass of registry.getAllCommands()) {
      const instance = container.resolve(CommandClass) as Command
      quarry.register(instance, CommandClass)
    }

    const result = await quarry.call('dependent')
    expect(result.output).toEqual(['injected-value'])
  })
})
