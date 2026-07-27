/**
 * Symbol keys for Router internal accessors.
 *
 * These symbols are NOT exported from the public `stratal/router` barrel.
 * Only internal modules (RouterResolver) import them, keeping the Router's
 * public API clean — users never see these methods.
 *
 * Registered via `Symbol.for` so that a duplicate evaluation of this module
 * (e.g. under a bundler or SSR module runner) resolves to the same symbol,
 * keeping symbol-keyed dispatch between `Router` and `RouterResolver` stable.
 *
 * @internal
 */

/** @internal */
export const getDefaultEntry: unique symbol = Symbol.for('stratal:router:getDefaultEntry')
/** @internal */
export const getGroups: unique symbol = Symbol.for('stratal:router:getGroups')
/** @internal */
export const getGlobalMiddleware: unique symbol = Symbol.for('stratal:router:getGlobalMiddleware')
