import 'reflect-metadata'

import { injectable, container as tsyringeRootContainer } from 'tsyringe'
import { beforeEach, describe, expect, it } from 'vitest'
import { Container } from '../../../di/container'
import { I18N_TOKENS } from '../../../i18n/i18n.tokens'
import { getCommandResult, setCommandInputs, setCommandQuarry } from '../../command-internals'
import type { QuarryRegistry } from '../../quarry-registry'
import { I18nStatsCommand } from '../i18n-stats.command'

const mockFlatMessages: Record<string, Record<string, string>> = {
  en: {
    'common.title': 'Title',
    'common.description': 'Desc',
    'validation.required': 'Required',
    'validation.email': 'Email',
  },
  fr: {
    'common.title': 'Titre',
    'common.description': 'Desc',
    'validation.required': 'Obligatoire',
    'fr.extra': 'Extra',
  },
  sw: {
    'common.title': 'Kichwa',
  },
}

function createMockLoader() {
  return {
    getAvailableLocales: () => ['en', 'fr', 'sw'],
    getDefaultLocale: () => 'en',
    getFilteredMessages: (locale: string, options?: { only?: string[] }) => {
      const flat = mockFlatMessages[locale] ?? {}
      if (!options?.only?.length) return flat
      return Object.fromEntries(
        Object.entries(flat).filter(([key]) =>
          options.only!.some((prefix) => key === prefix || key.startsWith(`${prefix}.`)),
        ),
      )
    },
  }
}

let childContainer: Container

beforeEach(() => {
  const tsyringe = tsyringeRootContainer.createChildContainer()
  childContainer = new Container({ container: tsyringe })
  childContainer.registerValue(I18N_TOKENS.MessageLoader, createMockLoader())

  injectable()(I18nStatsCommand)
  childContainer.register(I18nStatsCommand, I18nStatsCommand)
})

function createCommand(input: Record<string, unknown> = {}): I18nStatsCommand {
  const cmd = childContainer.resolve<I18nStatsCommand>(I18nStatsCommand)
  setCommandQuarry(cmd, { call: () => ({ exitCode: 0, output: [], errors: [] }) } as unknown as QuarryRegistry)
  setCommandInputs(cmd, { prefix: '', ...input })
  return cmd
}

describe('I18nStatsCommand', () => {
  it('should display coverage statistics for all locales', () => {
    const cmd = createCommand()
    const exitCode = cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(exitCode).toBe(0)
    expect(output).toContain('en')
    expect(output).toContain('100.0%')
    expect(output).toContain('fr')
    expect(output).toContain('75.0%')
    expect(output).toContain('sw')
    expect(output).toContain('25.0%')
  })

  it('should show dash for en extra column', () => {
    const cmd = createCommand()
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    const lines = output.split('\n')
    const enLine = lines.find((l) => l.includes('en') && l.includes('100.0%'))
    expect(enLine).toContain('-')
  })

  it('should show extra keys for non-en locales', () => {
    const cmd = createCommand()
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    const lines = output.split('\n')
    const frLine = lines.find((l) => l.includes('fr') && l.includes('75.0%'))
    expect(frLine).toContain('1')
  })

  it('should filter by prefix', () => {
    const cmd = createCommand({ prefix: 'common' })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('100.0%')
    expect(output).not.toContain('validation')
  })

  it('should handle no keys', () => {
    const loader = {
      getAvailableLocales: () => ['en'],
      getDefaultLocale: () => 'en',
      getFilteredMessages: () => ({}),
    }
    const tsyringe = tsyringeRootContainer.createChildContainer()
    const container = new Container({ container: tsyringe })
    container.registerValue(I18N_TOKENS.MessageLoader, loader)
    injectable()(I18nStatsCommand)
    container.register(I18nStatsCommand, I18nStatsCommand)

    const cmd = container.resolve<I18nStatsCommand>(I18nStatsCommand)
    setCommandQuarry(cmd, { call: () => ({ exitCode: 0, output: [], errors: [] }) } as unknown as QuarryRegistry)
    setCommandInputs(cmd, { prefix: '' })

    const exitCode = cmd.handle()
    const result = getCommandResult(cmd)

    expect(exitCode).toBe(0)
    expect(result.output.join('\n')).toContain('No message keys found')
  })

  it('should have the correct signature', () => {
    expect(I18nStatsCommand.command).toBe(
      'i18n:stats {--prefix= : Filter by namespace prefix}',
    )
  })
})
