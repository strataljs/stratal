import { beforeEach, describe, expect, it } from 'vitest'
import { Container } from '../../../di/container'
import { Transient } from '../../../di/decorators'
import { I18N_TOKENS } from '../../../i18n/i18n.tokens'
import { getCommandResult, setCommandInputs, setCommandQuarry } from '../../command-internals'
import type { QuarryRegistry } from '../../quarry-registry'
import { I18nListCommand } from '../i18n-list.command'

const mockFlatMessages: Record<string, Record<string, string>> = {
  en: {
    'common.title': 'Title',
    'common.description': 'Desc',
    'validation.required': 'Required',
  },
  fr: {
    'common.title': 'Titre',
    'validation.required': 'Obligatoire',
  },
}

function createMockLoader() {
  return {
    getAvailableLocales: () => ['en', 'fr'],
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

  Transient()(I18nListCommand)
  childContainer.register(I18nListCommand, I18nListCommand)
})

function createCommand(input: Record<string, unknown> = {}): I18nListCommand {
  const cmd = childContainer.resolve<I18nListCommand>(I18nListCommand)
  setCommandQuarry(cmd, { call: () => ({ exitCode: 0, output: [], errors: [] }) } as unknown as QuarryRegistry)
  setCommandInputs(cmd, { locale: '', prefix: '', values: false, ...input })
  return cmd
}

describe('I18nListCommand', () => {
  it('should list all keys with Y/N coverage per locale', () => {
    const cmd = createCommand()
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('common.title')
    expect(output).toContain('common.description')
    expect(output).toContain('validation.required')
    expect(output).toContain('Y')
    expect(output).toContain('N')
  })

  it('should show values when --locale and --values are set', () => {
    const cmd = createCommand({ locale: 'fr', values: true })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('Titre')
    expect(output).toContain('Obligatoire')
    expect(output).toContain('-')
  })

  it('should filter by prefix', () => {
    const cmd = createCommand({ prefix: 'common' })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('common.title')
    expect(output).toContain('common.description')
    expect(output).not.toContain('validation')
  })

  it('should filter by locale', () => {
    const cmd = createCommand({ locale: 'fr' })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('fr')
    expect(output).not.toContain(' en')
  })

  it('should handle no keys', () => {
    const loader = {
      getAvailableLocales: () => ['en'],
      getDefaultLocale: () => 'en',
      getFilteredMessages: () => ({}),
    }
    const container = new Container()
    container.registerValue(I18N_TOKENS.MessageLoader, loader)
    Transient()(I18nListCommand)
    container.register(I18nListCommand, I18nListCommand)

    const cmd = container.resolve<I18nListCommand>(I18nListCommand)
    setCommandQuarry(cmd, { call: () => ({ exitCode: 0, output: [], errors: [] }) } as unknown as QuarryRegistry)
    setCommandInputs(cmd, { locale: '', prefix: '', values: false })

    cmd.handle()
    const result = getCommandResult(cmd)

    expect(result.output.join('\n')).toContain('No message keys found')
  })

  it('should have the correct signature', () => {
    expect(I18nListCommand.command).toContain('i18n:list')
  })
})
