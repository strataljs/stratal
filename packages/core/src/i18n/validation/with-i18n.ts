import type { MessageKeys } from '../i18n.types'
import { errorMapContextStorage } from './validation.context'

/**
 * Type-safe helper for creating custom Zod error messages with i18n support (Backend)
 *
 * Usage with .refine():
 * ```typescript
 * const schema = z.string().refine(
 *   (val) => val.length > 5,
 *   withI18n('validation.minLength', { min: 5 })
 * )
 * ```
 *
 * Usage with built-in validators:
 * ```typescript
 * const schema = z.string().min(5, withI18n('validation.minLength', { min: 5 }))
 * const schema = z.string().email(withI18n('validation.email'))
 * ```
 *
 * Note: This is the backend version using AsyncLocalStorage.
 * For frontend, use withI18nFrontend from the frontend validation module
 *
 * @param key - Message key from shared i18n messages (type-safe via MessageKeys)
 * @param params - Optional interpolation parameters for the message
 * @returns Zod error configuration object with translated message
 */
export function withI18n(
  key: MessageKeys,
  params?: Record<string, unknown>
): { error: () => string } {
  return {
    error: () => {
      // Get i18n context from AsyncLocalStorage (backend)
      // This is set by the router middleware before validation
      const context = errorMapContextStorage.getStore()

      // Translate using context if available, otherwise fallback to generic message
      const message = context
        ? context.t(key, params as Record<string, string | number> | undefined)
        : 'Invalid input'

      return message
    },
  }
}
