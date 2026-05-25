import 'reflect-metadata'

import { injectable, container as tsyringeRootContainer } from 'tsyringe'
import { beforeEach, describe, expect, it } from 'vitest'
import { Container } from '../../../di/container'
import { I18N_TOKENS } from '../../../i18n/i18n.tokens'
import { getCommandResult, setCommandInputs, setCommandQuarry } from '../../command-internals'
import type { QuarryRegistry } from '../../quarry-registry'
import { I18nSearchCommand } from '../i18n-search.command'

const mockFlatMessages: Record<string, Record<string, string>> = {
  en: {
    'common.api.title': 'Stratal API',
    'common.api.description': 'Platform API',
    'validation.required': 'This field is required',
    'validation.email': 'Invalid email address',
  },
  fr: {
    'common.api.title': 'API Stratal',
    'validation.required': 'Ce champ est obligatoire',
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
  const tsyringe = tsyringeRootContainer.createChildContainer()
  childContainer = new Container({ container: tsyringe })
  childContainer.registerValue(I18N_TOKENS.MessageLoader, createMockLoader())

  injectable()(I18nSearchCommand)
  childContainer.register(I18nSearchCommand, I18nSearchCommand)
})

function createCommand(input: Record<string, unknown> = {}): I18nSearchCommand {
  const cmd = childContainer.resolve<I18nSearchCommand>(I18nSearchCommand)
  setCommandQuarry(cmd, { call: () => ({ exitCode: 0, output: [], errors: [] }) } as unknown as QuarryRegistry)
  setCommandInputs(cmd, { query: '', locale: '', 'keys-only': false, ...input })
  return cmd
}

describe('I18nSearchCommand', () => {
  it('should search by key substring', () => {
    const cmd = createCommand({ query: 'api' })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('common.api.title')
    expect(output).toContain('common.api.description')
    expect(output).not.toContain('validation')
  })

  it('should search by value substring', () => {
    const cmd = createCommand({ query: 'required' })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('validation.required')
    expect(output).toContain('This field is required')
  })

  it('should be case-insensitive', () => {
    const cmd = createCommand({ query: 'STRATAL' })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('common.api.title')
    expect(output).toContain('Stratal API')
  })

  it('should support --keys-only', () => {
    const cmd = createCommand({ query: 'stratal', 'keys-only': true })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('No keys matching')
  })

  it('should search in a specific locale', () => {
    const cmd = createCommand({ query: 'obligatoire', locale: 'fr' })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('validation.required')
    expect(output).toContain('Ce champ est obligatoire')
  })

  it('should show no results message when nothing matches', () => {
    const cmd = createCommand({ query: 'nonexistent' })
    cmd.handle()
    const result = getCommandResult(cmd)
    const output = result.output.join('\n')

    expect(output).toContain('No keys matching "nonexistent" found')
  })

  it('should have the correct signature', () => {
    expect(I18nSearchCommand.command).toContain('i18n:search')
  })
})
