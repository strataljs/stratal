import type { $ZodIssueCustom } from 'zod/v4/core'
import type { MessageKeys } from '../i18n.types'

/**
 * Custom error metadata for withZodI18n helper
 */
export interface I18nErrorMetadata {
  /**
   * Message key for translation
   */
  key: MessageKeys

  /**
   * Parameters for message interpolation
   */
  params?: Record<string, unknown>
}

/**
 * Zod custom issue with i18n metadata
 * Uses Zod v4 native $ZodIssueCustom type
 */
export type ZodCustomIssue = $ZodIssueCustom & {
  params?: {
    i18n?: I18nErrorMetadata
    [key: string]: unknown
  }
}
