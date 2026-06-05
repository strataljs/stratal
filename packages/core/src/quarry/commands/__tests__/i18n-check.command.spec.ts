import { beforeEach, describe, expect, it } from 'vitest'
import { Container } from '../../../di/container'
import { Transient } from '../../../di/decorators'
import { I18N_TOKENS } from '../../../i18n/i18n.tokens'
import { getCommandResult, setCommandInputs, setCommandQuarry } from '../../command-internals'
import type { QuarryRegistry } from '../../quarry-registry'
import { I18nCheckCommand } from '../i18n-check.command'

const mockFlatMessages: Record<string, Record<string, string>> = {
  en: {
    'common.api.title': 'API',
    'common.api.description': 'Platform API',
    'validation.required': 'Required',
    'validation.email': 'Invalid email',
    'validation.url': 'Invalid URL',
  },
  fr: {
    'common.api.title': 'API',
    'common.api.description': 'API de la plateforme',
    'validation.required': 'Obligatoire',
    'legacy.oldKey': 'Ancienne clé',
  },
  sw: {
    'common.api.title': 'API',
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
  childContainer = new Container()
  childContainer.registerValue(I18N_TOKENS.MessageLoader, createMockLoader())

  Transient()(I18nCheckCommand)
  childContainer.register(I18nCheckCommand, I18nCheckCommand)
})

function createCommand(input: Record<string, unknown> = {}): I18nCheckCommand {
  const cmd = childContainer.resolve<I18nCheckCommand>(I18nCheckCommand)
  setCommandQuarry(cmd, { call: () => ({ exitCode: 0, output: [], errors: [] }) } as unknown as QuarryRegistry)
  setCommandInputs(cmd, { locale: '', prefix: '', ...input })
  return cmd
}

describe('I18nCheckCommand', () => {
  it('should detect missing and extra keys across all locales', () => {
    const cmd = createCommand()
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')
    const errors = result.errors.join('\n')

    expect(result.exitCode).toBe(1)
    expect(output).toContain('Locale: fr')
    expect(output).toContain('Missing (2)')
    expect(output).toContain('validation.email')
    expect(output).toContain('validation.url')
    expect(output).toContain('Extra (1)')
    expect(output).toContain('legacy.oldKey')
    expect(output).toContain('Locale: sw')
    expect(output).toContain('Missing (4)')
    expect(errors).toContain('issue(s) found')
  })

  it('should filter by locale', () => {
    const cmd = createCommand({ locale: 'fr' })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(result.exitCode).toBe(1)
    expect(output).toContain('Locale: fr')
    expect(output).not.toContain('Locale: sw')
  })

  it('should filter by prefix', () => {
    const cmd = createCommand({ prefix: 'common' })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('Locale: sw')
    expect(output).toContain('Missing (1)')
    expect(output).toContain('common.api.description')
    expect(output).not.toContain('validation')
  })

  it('should report success when all translations are complete', () => {
    const loader = {
      getAvailableLocales: () => ['en', 'fr'],
      getDefaultLocale: () => 'en',
      getFilteredMessages: () => ({ 'common.title': 'Title' }),
    }
    const container = new Container()
    container.registerValue(I18N_TOKENS.MessageLoader, loader)
    Transient()(I18nCheckCommand)
    container.register(I18nCheckCommand, I18nCheckCommand)

    const cmd = container.resolve<I18nCheckCommand>(I18nCheckCommand)
    setCommandQuarry(cmd, { call: () => ({ exitCode: 0, output: [], errors: [] }) } as unknown as QuarryRegistry)
    setCommandInputs(cmd, { locale: '', prefix: '' })

    const exitCode = cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(exitCode).toBe(0)
    expect(output).toContain('All translations are complete')
  })

  it('should handle no non-en locales', () => {
    const loader = {
      getAvailableLocales: () => ['en'],
      getDefaultLocale: () => 'en',
      getFilteredMessages: () => ({ 'key': 'value' }),
    }
    const container = new Container()
    container.registerValue(I18N_TOKENS.MessageLoader, loader)
    Transient()(I18nCheckCommand)
    container.register(I18nCheckCommand, I18nCheckCommand)

    const cmd = container.resolve<I18nCheckCommand>(I18nCheckCommand)
    setCommandQuarry(cmd, { call: () => ({ exitCode: 0, output: [], errors: [] }) } as unknown as QuarryRegistry)
    setCommandInputs(cmd, { locale: '', prefix: '' })

    const exitCode = cmd.handle()
    const result = getCommandResult(cmd)

    expect(exitCode).toBe(0)
    expect(result.output.join('\n')).toContain('No non-en locales configured')
  })

  it('should have the correct signature', () => {
    expect(I18nCheckCommand.command).toBe(
      'i18n:check {--locale= : Check a specific locale only} {--prefix= : Filter by namespace prefix}',
    )
  })
})
