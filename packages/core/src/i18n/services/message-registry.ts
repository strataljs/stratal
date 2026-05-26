import { Singleton } from '../../di/decorators'
import { I18N_TOKENS } from '../i18n.tokens'
import { deepMerge } from '../utils/deep-merge'

/**
 * Global key for the shared contributions array.
 *
 * When stratal is installed via portal/symlink (e.g., in monorepos), bundlers
 * like esbuild may inline multiple copies of this module. Each copy gets its
 * own static class fields, so messages registered by one copy are invisible
 * to another. Using a `Symbol.for()` key on `globalThis` ensures all copies
 * share the same contributions array.
 */
const CONTRIBUTIONS_KEY = Symbol.for('stratal:i18n:message-registry:contributions')

type Contributions = Record<string, Record<string, unknown>>[]

function getContributions(): Contributions {
  const g = globalThis as Record<symbol, unknown>
  g[CONTRIBUTIONS_KEY] ??= [];
  return g[CONTRIBUTIONS_KEY] as Contributions
}

/**
 * Message Registry
 *
 * Accumulates i18n messages from multiple `I18nModule.registerMessages()` calls.
 * Messages are collected statically (at module import time) and deep-merged
 * when `getMergedMessages()` is called by `MessageLoaderService`.
 *
 * Later registrations override earlier ones at leaf level.
 */
@Singleton(I18N_TOKENS.MessageRegistry)
export class MessageRegistry {
  /**
   * Add messages (called statically by I18nModule.registerMessages)
   */
  static addMessages(messages: Record<string, Record<string, unknown>>): void {
    if (Boolean(messages) && typeof messages === 'object' && Object.keys(messages).length > 0) {
      getContributions().push(messages)
    }
  }

  /**
   * Get all messages deep-merged in registration order
   */
  getMergedMessages(): Record<string, Record<string, unknown>> {
    const merged: Record<string, Record<string, unknown>> = {}

    for (const contribution of getContributions()) {
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
    (globalThis as Record<symbol, unknown>)[CONTRIBUTIONS_KEY] = []
  }
}
