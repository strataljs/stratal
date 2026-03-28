/**
 * Symbol keys for Router internal accessors.
 *
 * These symbols are NOT exported from the public `stratal/router` barrel.
 * Only internal modules (RouterResolver) import them, keeping the Router's
 * public API clean — users never see these methods.
 *
 * Declared as individual unique symbols so TypeScript can distinguish
 * their return types in computed property access.
 *
 * @internal
 */

/** @internal */
export const getDefaultEntry: unique symbol = Symbol('Router.getDefaultEntry')
/** @internal */
export const getGroups: unique symbol = Symbol('Router.getGroups')
/** @internal */
export const getGlobalMiddleware: unique symbol = Symbol('Router.getGlobalMiddleware')
