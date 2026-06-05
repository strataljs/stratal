import { Singleton } from '../../di/decorators'
import { I18N_TOKENS } from '../i18n.tokens'
import { deepMerge } from '../utils/deep-merge'

/**
 * Global key for the shared contributions store.
 *
 * When stratal is installed via portal/symlink (e.g., in monorepos), bundlers
 * like esbuild may inline multiple copies of this module. Each copy gets its
 * own static class fields, so messages registered by one copy are invisible
 * to another. Using a `Symbol.for()` key on `globalThis` ensures all copies
 * share the same contributions store.
 */
const CONTRIBUTIONS_KEY = Symbol.for('stratal:i18n:message-registry:contributions')

type Contribution = Record<string, Record<string, unknown>>
type Contributions = Map<string, Contribution>

function getContributions(): Contributions {
  const g = globalThis as Record<symbol, unknown>
  g[CONTRIBUTIONS_KEY] ??= new Map();
  return g[CONTRIBUTIONS_KEY] as Contributions
}

/**
 * Stable, key-order-independent identity for a contribution. Keyed dedup is
 * what keeps the globalThis store bounded across Vite HMR reloads: module
 * re-evaluation re-registers the same messages, which must not accumulate.
 */
function contentKey(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(contentKey).join(',')}]`
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${contentKey((value as Record<string, unknown>)[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

/**
 * Message Registry
 *
 * Accumulates i18n messages from multiple `I18nModule.registerMessages()` calls.
 * Messages are collected statically (at module import time) and deep-merged
 * when `getMergedMessages()` is called by `MessageLoaderService`.
 *
 * Later registrations override earlier ones at leaf level. Contributions are
 * stored content-keyed: re-registering identical messages (HMR reload) moves
 * the entry to the end instead of appending a duplicate, so registration
 * order is always the latest evaluation order and the store stays bounded.
 * Entries whose content changed leave their stale predecessor behind, but
 * live entries are re-appended after it on every reload, so stale content
 * sinks to the lowest merge precedence.
 */
@Singleton(I18N_TOKENS.MessageRegistry)
export class MessageRegistry {
  /**
   * Add messages (called statically by I18nModule.registerMessages)
   */
  static addMessages(messages: Contribution): void {
    if (Boolean(messages) && typeof messages === 'object' && Object.keys(messages).length > 0) {
      const contributions = getContributions()
      const key = contentKey(messages)
      contributions.delete(key)
      contributions.set(key, messages)
    }
  }

  /**
   * Get all messages deep-merged in registration order
   */
  getMergedMessages(): Record<string, Record<string, unknown>> {
    const merged: Record<string, Record<string, unknown>> = {}

    for (const contribution of getContributions().values()) {
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
    (globalThis as Record<symbol, unknown>)[CONTRIBUTIONS_KEY] = new Map()
  }
}
