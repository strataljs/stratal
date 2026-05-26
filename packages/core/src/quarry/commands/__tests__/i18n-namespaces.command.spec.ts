import { beforeEach, describe, expect, it } from 'vitest'
import { Container } from '../../../di/container'
import { Transient } from '../../../di/decorators'
import { I18N_TOKENS } from '../../../i18n/i18n.tokens'
import { getCommandResult, setCommandInputs, setCommandQuarry } from '../../command-internals'
import type { QuarryRegistry } from '../../quarry-registry'
import { I18nNamespacesCommand } from '../i18n-namespaces.command'

const mockFlatMessages: Record<string, Record<string, string>> = {
  en: {
    'common.api.title': 'Title',
    'common.api.description': 'Desc',
    'common.actions.save': 'Save',
    'validation.required': 'Required',
    'validation.email': 'Email',
  },
  fr: {
    'common.api.title': 'Titre',
    'common.actions.save': 'Enregistrer',
    'validation.required': 'Obligatoire',
  },
}

function createMockLoader() {
  return {
    getAvailableLocales: () => ['en', 'fr'],
    getDefaultLocale: () => 'en',
    getFilteredMessages: (locale: string) => mockFlatMessages[locale] ?? {},
  }
}

let childContainer: Container

beforeEach(() => {
  childContainer = new Container()
  childContainer.registerValue(I18N_TOKENS.MessageLoader, createMockLoader())

  Transient()(I18nNamespacesCommand)
  childContainer.register(I18nNamespacesCommand, I18nNamespacesCommand)
})

function createCommand(input: Record<string, unknown> = {}): I18nNamespacesCommand {
  const cmd = childContainer.resolve<I18nNamespacesCommand>(I18nNamespacesCommand)
  setCommandQuarry(cmd, { call: () => ({ exitCode: 0, output: [], errors: [] }) } as unknown as QuarryRegistry)
  setCommandInputs(cmd, { depth: '', locale: '', ...input })
  return cmd
}

describe('I18nNamespacesCommand', () => {
  it('should list namespaces at depth 1 with counts per locale', () => {
    const cmd = createCommand()
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('common')
    expect(output).toContain('validation')
    expect(output).toContain('3')
    expect(output).toContain('2')
  })

  it('should support deeper namespace depth', () => {
    const cmd = createCommand({ depth: '2' })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('common.api')
    expect(output).toContain('common.actions')
    expect(output).toContain('validation')
  })

  it('should filter by locale', () => {
    const cmd = createCommand({ locale: 'fr' })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('fr')
    expect(output).not.toContain(' en')
  })

  it('should handle no namespaces', () => {
    const loader = {
      getAvailableLocales: () => ['en'],
      getDefaultLocale: () => 'en',
      getFilteredMessages: () => ({}),
    }
    const container = new Container()
    container.registerValue(I18N_TOKENS.MessageLoader, loader)
    Transient()(I18nNamespacesCommand)
    container.register(I18nNamespacesCommand, I18nNamespacesCommand)

    const cmd = container.resolve<I18nNamespacesCommand>(I18nNamespacesCommand)
    setCommandQuarry(cmd, { call: () => ({ exitCode: 0, output: [], errors: [] }) } as unknown as QuarryRegistry)
    setCommandInputs(cmd, { depth: '', locale: '' })

    cmd.handle()
    const result = getCommandResult(cmd)

    expect(result.output.join('\n')).toContain('No namespaces found')
  })

  it('should have the correct signature', () => {
    expect(I18nNamespacesCommand.command).toContain('i18n:namespaces')
  })
})
