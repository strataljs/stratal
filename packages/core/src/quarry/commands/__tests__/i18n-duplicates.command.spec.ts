import { beforeEach, describe, expect, it } from 'vitest'
import { Container } from '../../../di/container'
import { Transient } from '../../../di/decorators'
import { I18N_TOKENS } from '../../../i18n/i18n.tokens'
import { getCommandResult, setCommandInputs, setCommandQuarry } from '../../command-internals'
import type { QuarryRegistry } from '../../quarry-registry'
import { I18nDuplicatesCommand } from '../i18n-duplicates.command'

const mockFlatMessages: Record<string, Record<string, string>> = {
  en: {
    'validation.required': 'Required',
    'zodI18n.errors.required': 'Required',
    'validation.email': 'Invalid email',
    'validation.url': 'Invalid URL',
    'common.title': 'Title',
  },
  fr: {
    'common.title': 'Titre',
    'common.heading': 'Titre',
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

  Transient()(I18nDuplicatesCommand)
  childContainer.register(I18nDuplicatesCommand, I18nDuplicatesCommand)
})

function createCommand(input: Record<string, unknown> = {}): I18nDuplicatesCommand {
  const cmd = childContainer.resolve<I18nDuplicatesCommand>(I18nDuplicatesCommand)
  setCommandQuarry(cmd, { call: () => ({ exitCode: 0, output: [], errors: [] }) } as unknown as QuarryRegistry)
  setCommandInputs(cmd, { locale: '', prefix: '', ...input })
  return cmd
}

describe('I18nDuplicatesCommand', () => {
  it('should find duplicate values in en locale', () => {
    const cmd = createCommand()
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('Required')
    expect(output).toContain('validation.required')
    expect(output).toContain('zodI18n.errors.required')
  })

  it('should find duplicates in a specific locale', () => {
    const cmd = createCommand({ locale: 'fr' })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('Titre')
    expect(output).toContain('common.title')
    expect(output).toContain('common.heading')
  })

  it('should filter by prefix', () => {
    const cmd = createCommand({ prefix: 'validation' })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('No duplicate values found')
  })

  it('should show no duplicates message when none found', () => {
    const loader = {
      getAvailableLocales: () => ['en'],
      getDefaultLocale: () => 'en',
      getFilteredMessages: () => ({
        'a': 'unique1',
        'b': 'unique2',
      }),
    }
    const container = new Container()
    container.registerValue(I18N_TOKENS.MessageLoader, loader)
    Transient()(I18nDuplicatesCommand)
    container.register(I18nDuplicatesCommand, I18nDuplicatesCommand)

    const cmd = container.resolve<I18nDuplicatesCommand>(I18nDuplicatesCommand)
    setCommandQuarry(cmd, { call: () => ({ exitCode: 0, output: [], errors: [] }) } as unknown as QuarryRegistry)
    setCommandInputs(cmd, { locale: '', prefix: '' })

    cmd.handle()
    const result = getCommandResult(cmd)

    expect(result.output.join('\n')).toContain('No duplicate values found')
  })

  it('should have the correct signature', () => {
    expect(I18nDuplicatesCommand.command).toContain('i18n:duplicates')
  })
})
