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
