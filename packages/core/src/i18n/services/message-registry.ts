import { Transient } from '../../di/decorators'
import { I18N_TOKENS } from '../i18n.tokens'
import { deepMerge } from '../utils/deep-merge'

/**
 * Message Registry
 *
 * Accumulates i18n messages from multiple `I18nModule.registerMessages()` calls.
 * Messages are collected statically (at module import time) and deep-merged
 * when `getMergedMessages()` is called by `MessageLoaderService`.
 *
 * Later registrations override earlier ones at leaf level.
 */
@Transient(I18N_TOKENS.MessageRegistry)
export class MessageRegistry {
  private static contributions: Record<string, Record<string, unknown>>[] = []

  /**
   * Add messages (called statically by I18nModule.registerMessages)
   */
  static addMessages(messages: Record<string, Record<string, unknown>>): void {
    if (Boolean(messages) && typeof messages === 'object' && Object.keys(messages).length > 0) {
      MessageRegistry.contributions.push(messages)
    }
  }

  /**
   * Get all messages deep-merged in registration order
   */
  getMergedMessages(): Record<string, Record<string, unknown>> {
    const merged: Record<string, Record<string, unknown>> = {}

    for (const contribution of MessageRegistry.contributions) {
      for (const locale of Object.keys(contribution)) {
        merged[locale] = deepMerge(
          (merged[locale] ?? {}),
          contribution[locale],
        )
      }
    }

    return merged
  }

  /**
   * Reset registry (for testing)
   * @internal
   */
  static reset(): void {
    MessageRegistry.contributions = []
  }
}
