/**
 * Symbol key for storing internal mutable state on Command instances.
 * Keeps internal state hidden from user-facing autocomplete.
 */
export const COMMAND_INTERNALS = Symbol.for('stratal:command:internals')
