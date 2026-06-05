/**
 * Augmentable route map for type-safe URL generation.
 *
 * Users augment this interface via `declare module 'stratal/router'` to get
 * autocomplete on `route()` calls and type-checked params.
 * Generated automatically by `quarry route:types`.
 *
 * Follows the same augmentation pattern as `CustomEventRegistry` in `stratal/events`.
 *
 * @example
 * ```typescript
 * declare module 'stratal/router' {
 *   interface StratalRouteMap {
 *     'users.index': { params: never }
 *     'users.show': { params: { id: string } }
 *     'tenant.dashboard': { params: { tenant: string } }
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentable interface, intentionally empty
export interface StratalRouteMap { }

/**
 * All valid route names.
 * Falls back to `string` when no routes are registered in StratalRouteMap.
 */
export type RouteName = keyof StratalRouteMap extends never
  ? string
  : Extract<keyof StratalRouteMap, string>

/**
 * Resolves the required params for a named route.
 * When StratalRouteMap is augmented, provides type-safe param objects.
 * Falls back to `Record<string, string> | undefined` for untyped routes.
 */
export type RouteParams<N extends RouteName> =
  N extends keyof StratalRouteMap
    ? StratalRouteMap[N] extends { params: infer P }
      ? [P] extends [never]
        ? Record<string, string> | undefined
        : P
      : Record<string, string> | undefined
    : Record<string, string> | undefined

/**
 * Minimal route data for client-side URL generation.
 * Contains only the fields needed by URL building logic — no server metadata.
 */
export interface SerializedRoute {
  path: string
  paramNames: string[]
  domain?: string
  domainParamNames: string[]
  localePaths?: string[]
}

/**
 * A record of named routes keyed by route name, used for client-side URL building.
 * Serialized from `RouteRegistry.named()` on the server, consumed by `useRoute()` on the client.
 */
export type SerializedRoutes = Record<string, SerializedRoute>

/**
 * Snapshot of the route bound to the current request — shared with the client
 * so URL helpers can answer "which route am I on?", "what are its params?",
 * and "which sticky defaults should I auto-apply?" without parsing the URL.
 *
 * Discriminated by `name`. When `StratalRouteMap` is augmented, narrowing on
 * `name` strictly types `params` per route:
 *
 * ```ts
 * if (route.name === 'users.show') {
 *   route.params.id // typed as string
 * }
 * ```
 */
export type CurrentRoute =
  | { [K in RouteName]: { name: K; params: NonNullable<RouteParams<K>>; defaults: Record<string, string> } }[RouteName]
  | { name: null; params: Record<string, string>; defaults: Record<string, string> }

/**
 * All valid arguments to `current(name)` — strict route names plus dotted
 * wildcard patterns like `'users.*'` derived from real route prefixes.
 *
 * When `StratalRouteMap` is augmented and contains `'admin.users.show'`,
 * valid wildcards are `'admin.*'` and `'admin.users.*'`. When un-augmented,
 * collapses to `string`. When augmented but no route name has a `.`
 * separator, the wildcard alternative resolves to `never` and the union
 * collapses to just `RouteName`.
 */
export type RouteMatcher = keyof StratalRouteMap extends never
  ? string
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- RoutePrefixes<RouteName> can resolve to `never` when no route names contain a `.`; the union with `RouteName` is then equivalent to `RouteName` and is the intended fallback.
  : RouteName | `${RoutePrefixes<RouteName>}.*`

/**
 * Recursively split a dotted name into all its prefix segments.
 *
 * @example
 * RoutePrefixes<'admin.users.show'> // 'admin' | 'admin.users'
 */
export type RoutePrefixes<S extends string> = S extends `${infer Head}.${infer Rest}`
  ? Head | `${Head}.${RoutePrefixes<Rest>}`
  : never
