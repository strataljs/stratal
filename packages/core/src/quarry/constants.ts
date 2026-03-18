/**
 * Metadata key for auto-discovery of command classes.
 *
 * Uses `Symbol.for()` (global symbol registry) so that both core and
 * framework packages can reference the same symbol without cross-imports.
 */
export const COMMAND_METADATA_KEY = Symbol.for('stratal:command')

/**
 * Symbol key for storing internal mutable state on Command instances.
 * Keeps internal state hidden from user-facing autocomplete.
 */
export const COMMAND_INTERNALS = Symbol.for('stratal:command:internals')
