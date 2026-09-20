import { describe, expect, it } from 'vitest'
import { Container, runWithContainer } from 'stratal/di'
import {
  I18N_TOKENS,
  MessageLoaderService,
  MessageRegistry,
  type II18nService,
  type MessageKeys,
  type MessageParams,
} from 'stratal/i18n'
import { ModalBackgroundFetchError } from '../../errors/modal-background-fetch.error'
import { ModalBaseCycleError } from '../../errors/modal-base-cycle.error'
// Importing the module is the whole point of the test: its `imports` are what
// hand `modalMessages` to the registry, and nothing else in the package reaches
// the message file. Without that registration these errors carry their key.
import '../../modal.module'

/**
 * A container holding the pieces `withI18n` reaches for.
 *
 * The registry and the loader are the real ones, so the assertion runs against
 * the messages as registered and compiled rather than against a stub of them.
 * `I18nService` itself is not part of the package's public API, and all it adds
 * is locale selection off the request — which is `'en'` here either way.
 */
function containerWithTranslator(): Container {
  const container = new Container()
  container.registerSingleton(I18N_TOKENS.MessageRegistry, MessageRegistry)
  container.registerSingleton(I18N_TOKENS.MessageLoader, MessageLoaderService)

  const loader = container.resolve<MessageLoaderService>(I18N_TOKENS.MessageLoader)
  const i18n: II18nService = {
    t: (key: MessageKeys, params?: MessageParams) => loader.translate('en', key, params),
    getLocale: () => 'en',
  }
  container.registerValue(I18N_TOKENS.I18nService, i18n)

  return container
}

describe('modal messages', () => {
  it('reads back as English rather than as the key it was raised from', () => {
    const message = runWithContainer(
      containerWithTranslator(),
      () => new ModalBackgroundFetchError().message,
    )

    expect(message).toBe('Failed to load background page for modal')
  })

  it('registers every key the package raises', () => {
    const messages = runWithContainer(containerWithTranslator(), () => ({
      baseCycle: new ModalBaseCycleError('/parent').message,
    }))

    expect(messages).toEqual({
      baseCycle: 'The modal base chain leads back to /parent',
    })
  })
})
