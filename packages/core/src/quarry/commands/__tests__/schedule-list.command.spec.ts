import { beforeEach, describe, expect, it } from 'vitest'
import { createMock } from '@stratal/testing/mocks'
import { Container } from '../../../di/container'
import { Transient } from '../../../di/decorators'
import { DI_TOKENS } from '../../../di/tokens'
import { LOGGER_TOKENS, type LoggerService } from '../../../logger'
import { LazyModuleLoader } from '../../../module/lazy-module-loader'
import { ModuleRegistry } from '../../../module/module-registry'
import { CronModule } from '../../../cron/cron.module'
import type { CronManager } from '../../../cron/cron-manager'
import { setCommandInputs, getCommandResult } from '../../command-internals'
import { QuarryRegistry } from '../../quarry-registry'
import { ScheduleListCommand } from '../schedule-list.command'

let container: Container
let loader: LazyModuleLoader

beforeEach(() => {
  container = new Container()
  const logger = createMock<LoggerService>()
  container.registerValue(LOGGER_TOKENS.LoggerService, logger)
  container.registerValue(DI_TOKENS.ExceptionHandler, { handle: (e: unknown) => ({ message: String(e) }) })

  const registry = new ModuleRegistry(container, logger as unknown as LoggerService)
  container.registerValue(DI_TOKENS.ModuleRegistry, registry)
  container.registerValue(DI_TOKENS.Quarry, new QuarryRegistry(container))

  loader = new LazyModuleLoader(registry, container, logger as unknown as LoggerService)
  container.registerValue(DI_TOKENS.LazyModuleLoader, loader)

  Transient()(ScheduleListCommand)
  container.register(ScheduleListCommand, ScheduleListCommand)
})

function createCommand(): ScheduleListCommand {
  const cmd = container.resolve<ScheduleListCommand>(ScheduleListCommand)
  setCommandInputs(cmd, {})
  return cmd
}

class FooJob {
  static schedule = '0 0 * * *'
  handle() { /* noop */ }
}

describe('ScheduleListCommand', () => {
  it('lazy-loads CronModule and reports no jobs when none are registered', async () => {
    const cmd = createCommand()
    const exitCode = await cmd.handle()
    const result = getCommandResult(cmd)

    expect(exitCode).toBe(0)
    expect(result.output.join('\n')).toContain('No cron jobs found')
  })

  it('lists jobs registered on the (deduped) cron manager singleton', async () => {
    // Pre-load CronModule and populate the singleton, as bootstrap ensureCron would.
    const ref = await loader.load(() => Promise.resolve(CronModule))
    const cron = ref.get<CronManager>(DI_TOKENS.Cron)
    cron.registerJob('0 0 * * *', FooJob as never)

    const cmd = createCommand()
    await cmd.handle()
    const output = getCommandResult(cmd).output.join('\n')

    expect(output).toContain('0 0 * * *')
    expect(output).toContain('FooJob')
  })
})
