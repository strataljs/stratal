import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inject, Transient } from '../../di'
import { Container } from '../../di/container'
import { runWithContainer } from '../../di/container-storage'
import type { LoggerService } from '../../logger/services/logger.service'
import { ModuleRegistry } from '../../module/module-registry'
import { Module } from '../../module/module.decorator'
import type { Constructor } from '../../types'
import { Command } from '../command'
import { isCommand } from '../is-command'
import { QuarryRegistry } from '../quarry-registry'

describe('Command Auto-Wiring (Application-level)', () => {
  let container: Container
  let mockLogger: DeepMocked<LoggerService>
  let registry: ModuleRegistry

  beforeEach(() => {
    vi.clearAllMocks()
    container = new Container()
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
        { provide: CMD_TOKEN, useClass: MyCommand },
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

    const quarry = new QuarryRegistry(container)
    const commands = registry.getAllCommands()
    expect(commands).toHaveLength(1)

    for (const CommandClass of commands) {
      quarry.register(CommandClass as Constructor<Command>)
    }

    expect(quarry.has('greet')).toBe(true)
  })

  it('should handle command with injected dependencies', async () => {
    const SERVICE_TOKEN = Symbol('TestService')

    class TestService {
      getValue() { return 'injected-value' }
    }

    container.register(SERVICE_TOKEN, TestService)

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

    const quarry = new QuarryRegistry(container)
    for (const CommandClass of registry.getAllCommands()) {
      quarry.register(CommandClass as Constructor<Command>)
    }

    const result = await runWithContainer(container, () => quarry.call('dependent'))
    expect(result.output).toEqual(['injected-value'])
  })
})
