import type { $ZodIssueCustom } from 'zod/v4/core'
import type { MessageKeys } from '../i18n.types'

/**
 * Context provided to error map for locale-aware translation
 */
export interface ErrorMapContext {
  /**
   * Translate a message key with optional parameters
   */
  t: (key: MessageKeys, params?: Record<string, unknown>) => string

  /**
   * Current locale code (e.g., 'en', 'fr')
   */
  locale: string
}

/**
 * Function that provides the current translation context
 * Used by error maps to access request-scoped or application-wide i18n
 */
export type LocaleProvider = () => ErrorMapContext | undefined

/**
 * Custom error metadata for withI18n helper
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
