/**
 * The `access` prop shared by `@stratal/framework`'s `AccessShareMiddleware`.
 *
 * `permissions` is the user's merged permission set across all their roles,
 * keyed by resource. A guest gets `{ roles: [], permissions: {} }` — which is
 * "authenticated with nothing", not an error state.
 */
export interface SharedAccess {
  roles: string[]
  permissions: Record<string, string[]>
}

declare const REGISTRY_REQUIRED: unique symbol

/**
 * Surfaced in place of the permission/role union when {@link AccessControlRegistry}
 * has not been generated, so the error names the actual problem instead of
 * complaining about an opaque `never`.
 */
export interface AccessControlRegistryNotGenerated {
  readonly [REGISTRY_REQUIRED]: 'Run `quarry inertia:types` with `accessControl` configured on AuthModule.forRootAsync()'
}

/**
 * Permission strings and role names for this app.
 *
 * **Generated — never write this by hand.** The `@stratal/inertia` type
 * generator emits it into `src/inertia/inertia.d.ts` by resolving the
 * `accessControl:` option on your `AuthModule.forRootAsync(...)` call. It is
 * rewritten on every `quarry inertia:types` run and on every Vite change, so a
 * hand-written declaration would be silently overwritten — and would in any
 * case describe permissions the server has not agreed to.
 */
export interface AccessControlRegistry { }

/** Every permission string this app's access control defines. */
export type Permission = AccessControlRegistry extends { permissions: infer P extends string }
  ? P
  : AccessControlRegistryNotGenerated

/** Every role name this app's access control defines. */
export type RoleName = AccessControlRegistry extends { roles: infer R extends string }
  ? R
  : AccessControlRegistryNotGenerated

/**
 * A single value, or an OR/AND group. Deliberately not a bare array:
 * `['a', 'b']` reads as either and would have to pick one silently.
 */
export type Check<T> = T | { any: readonly T[] } | { all: readonly T[] }
