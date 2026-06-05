import { type $ZodRawIssue } from 'zod/v4/core'
import { getContainer } from '../../di/container-storage'
import { I18N_TOKENS } from '../i18n.tokens'
import type { II18nService, MessageKeys } from '../i18n.types'

/**
 * Type-safe helper for creating custom Zod error messages with i18n support
 *
 * Usage with .refine():
 * ```typescript
 * const schema = z.string().refine(
 *   (val) => val.length > 5,
 *   withZodI18n('validation.minLength', { min: 5 })
 * )
 * ```
 *
 * Usage with built-in validators:
 * ```typescript
 * const schema = z.string().min(5, withZodI18n('validation.minLength', { min: 5 }))
 * const schema = z.string().email(withZodI18n('validation.email'))
 * ```
 *
 * @param key - Message key from shared i18n messages (type-safe via MessageKeys)
 * @param params - Optional interpolation parameters for the message
 * @returns Zod error configuration object with translated message
 */
export function withZodI18n(
  key: MessageKeys,
  params?: Record<string, unknown>
): { error: (_issue: $ZodRawIssue) => string } {
  return {
    error: (_issue: $ZodRawIssue) => {
      try {
        const container = getContainer()
        const i18n = container.resolve<II18nService>(I18N_TOKENS.I18nService)
        return i18n.t(key, params as Record<string, string | number> | undefined)
      } catch {
        return 'Invalid input'
      }
    },
  }
}
