/**
 * I18n Module Type System
 *
 * Provides type-safe message keys via module augmentation.
 * Applications augment the AppMessages interface to add their own message types.
 */

import type * as systemEn from './messages/en'

/**
 * Recursively extract nested keys from an object type
 * Converts nested object to dot-notation string union
 *
 * @example
 * ```typescript
 * type Example = { auth: { login: { title: string } } }
 * type Keys = DeepKeys<Example>
 * // Results in: 'auth.login.title'
 * ```
 */
export type DeepKeys<T, Prefix extends string = ''> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? DeepKeys<T[K], `${Prefix}${K}.`>
        : `${Prefix}${K}`
    }[keyof T & string]
  : never

/**
 * System message keys - auto-derived from system en messages
 * These are messages used by packages/modules infrastructure
 */
export type SystemMessageKeys = DeepKeys<typeof systemEn>

/**
 * Augmentable interface for app-specific messages
 *
 * Applications should augment this interface with their message types:
 *
 * @example
 * ```typescript
 * // In apps/backend/src/i18n/types.ts
 * import type * as appEn from 'stratal/i18n/messages/en'
 *
 * declare module 'stratal' {
 *   interface AppMessages extends typeof appEn {}
 * }
 * ```
 */
export interface AppMessages {}

/**
 * Auto-derive app keys from AppMessages
 * When AppMessages is augmented, this type automatically includes all app message keys
 */
export type AppMessageKeys = DeepKeys<AppMessages>

/**
 * Union type used by I18nService.t()
 * Combines system message keys with app-specific message keys
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- AppMessageKeys resolves to never when unaugmented, but becomes meaningful after module augmentation
export type MessageKeys = SystemMessageKeys | AppMessageKeys

/**
 * Type for translation parameters
 * Used for string interpolation in messages
 */
export type MessageParams = Record<string, string | number>

/**
 * I18n Service interface
 */
export interface II18nService {
  /**
   * Translate a message key
   *
   * @param key - Message key (e.g., 'common.actions.save', 'errors.notFound')
   * @param params - Optional parameters for interpolation
   * @returns Translated string
   */
  t(key: MessageKeys, params?: MessageParams): string

  /**
   * Get current locale
   *
   * @returns Current locale code from RouterContext or default
   */
  getLocale(): string
}
