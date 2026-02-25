/**
 * Core Messages
 *
 * Messages used by packages/modules infrastructure.
 * These are automatically merged with application-specific messages.
 */

import * as en from './en'

/**
 * All locale messages
 * Explicitly import and export (no filesystem scanning - Cloudflare Workers compatible)
 */
export const messages = { en } as const

/**
 * Type for all messages
 */
export type Messages = typeof messages

/**
 * Get messages for all locales
 */
export function getMessages(): Record<string, Record<string, unknown>> {
  return messages
}

/**
 * Get available locales
 */
export function getLocales(): string[] {
  return Object.keys(messages)
}
