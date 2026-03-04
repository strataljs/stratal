/**
 * Metadata keys for event listener decorators.
 *
 * Uses `Symbol.for()` (global symbol registry) so that both core and
 * framework packages can reference the same symbols without cross-imports.
 */
export const LISTENER_METADATA_KEYS = {
  IS_LISTENER: Symbol.for('stratal:listener'),
  EVENT_HANDLERS: Symbol.for('stratal:listener:handlers'),
} as const
