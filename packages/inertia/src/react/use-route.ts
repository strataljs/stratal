/**
 * React hook for Ziggy-like client-side URL generation.
 *
 * Reads serialized routes from Inertia shared props (injected by the `routes`
 * option on {@link InertiaModuleOptions}) and provides a type-safe `route()`
 * function that mirrors the server-side `buildRouteUrl()`.
 *
 * @module
 */

import type { PageProps } from '@inertiajs/core'
import { usePage } from '@inertiajs/react'
import { useMemo } from 'react'
import type { RouteName, RouteParams, SerializedRoute, SerializedRoutes, TrailingSlashMode } from 'stratal/router'

interface RoutesPageProps extends PageProps {
  routes: SerializedRoutes
  trailingSlash?: TrailingSlashMode
}

/**
 * Apply a trailing-slash mode to a URL or path.
 *
 * Pure reimplementation of `applyTrailingSlash()` from `stratal/router` —
 * mirrored here to keep the React bundle decoupled from server-only deps.
 *
 * - `'ignore'` — return as-is.
 * - `'always'` — append `/` unless path is root or last segment is file-like (`.json`, etc.).
 * - `'never'`  — strip a single trailing `/` from the pathname (skip root).
 *
 * Preserves query string and hash. Handles relative paths and absolute URLs.
 */
export function applyTrailingSlash(url: string, mode: TrailingSlashMode): string {
  if (mode === 'ignore') return url

  const isAbsolute = /^https?:\/\//i.test(url)
  const parsed = isAbsolute ? new URL(url) : new URL(url, 'http://placeholder.local')
  const path = parsed.pathname
  if (path === '/') return url
  const hasTrailing = path.endsWith('/')

  if (mode === 'always' && !hasTrailing) {
    const lastSegment = path.slice(path.lastIndexOf('/') + 1)
    if (lastSegment.includes('.')) return url
    parsed.pathname = `${path}/`
  } else if (mode === 'never' && hasTrailing) {
    parsed.pathname = path.slice(0, -1)
  } else {
    return url
  }

  return isAbsolute
    ? parsed.toString()
    : `${parsed.pathname}${parsed.search}${parsed.hash}`
}

function stripTrailing(p: string): string {
  return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p
}

/**
 * Build a URL from a serialized route definition.
 *
 * Mirrors `buildRouteUrl()` from `stratal/router` (pure reimplementation to
 * avoid pulling server-side dependencies into the browser bundle).
 */
function buildUrl(route: SerializedRoute, name: string, params?: Record<string, string>): string {
  const allParams = { ...params }
  const consumedKeys = new Set<string>()
  let url = route.path

  // When locale is provided and route has locale variants, prepend locale segment
  if (allParams.locale && route.localePaths?.length) {
    url = `/${allParams.locale}${url === '/' ? '' : url}`
    consumedKeys.add('locale')
  }

  // Fill path :param placeholders (handles optional regex constraints like :locale{en|de|fr})
  for (const paramName of route.paramNames) {
    const value = allParams[paramName]
    if (value === undefined) {
      throw new Error(`Missing required parameter "${paramName}" for route "${name}" (path: ${route.path})`)
    }
    url = url.replace(
      new RegExp(`:${paramName}(\\{[^}]*\\})?`),
      encodeURIComponent(value),
    )
    consumedKeys.add(paramName)
  }

  // Build domain if present
  let domain: string | undefined
  if (route.domain) {
    domain = route.domain
    for (const domainParam of route.domainParamNames) {
      const value = allParams[domainParam]
      if (value === undefined) {
        throw new Error(`Missing required parameter "${domainParam}" for route "${name}" (domain: ${route.domain})`)
      }
      domain = domain.replace(`{${domainParam}}`, encodeURIComponent(value))
      consumedKeys.add(domainParam)
    }
  }

  // Remaining params become query string
  const queryEntries = Object.entries(allParams).filter(([key]) => !consumedKeys.has(key))
  if (queryEntries.length > 0) {
    const queryString = queryEntries
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    url = `${url}${queryString.length ? `?${queryString}` : ''}`
  }

  // Prepend domain if present
  if (domain) {
    url = `https://${domain}${url}`
  }

  return url
}

/**
 * Check if a route path pattern matches a given pathname.
 *
 * Converts `:param{constraint}` and `:param` segments to regex wildcards.
 * Tolerant of trailing-slash differences on either side: `/users/:id` matches
 * both `/users/1` and `/users/1/` so active-link checks don't depend on the
 * configured trailing-slash mode.
 */
export function matchPath(routePath: string, pathname: string): boolean {
  const regexStr = stripTrailing(routePath)
    .replace(/:[\w]+\{[^}]*\}/g, '[^/]+')
    .replace(/:[\w]+/g, '[^/]+')
  return new RegExp(`^${regexStr}$`).test(stripTrailing(pathname))
}

/**
 * Hook that provides Ziggy-like route URL generation in React components.
 *
 * Consumes `routes` from Inertia shared props and returns a `route()` function
 * that builds URLs client-side using the serialized route map.
 *
 * Route names and params are strictly typed from `StratalRouteMap` (generated
 * by `quarry route:types`).
 *
 * Requires the `routes` option to be set on `InertiaModule.forRoot()` to inject
 * the shared props.
 *
 * @returns An object with:
 * - `route` — URL generation function accepting a route name and optional params
 * - `current` — Function to check the current route name or match against a name
 *
 * @example
 * ```tsx
 * import { useRoute } from '@stratal/inertia/react'
 *
 * export default function UserProfile({ user }) {
 *   const { route, current } = useRoute()
 *
 *   return (
 *     <nav>
 *       <a href={route('users.index')}>All Users</a>
 *       <a href={route('users.show', { id: user.id })}>
 *         {user.name}
 *       </a>
 *       {current('users.show') && <span>Currently viewing</span>}
 *     </nav>
 *   )
 * }
 * ```
 */
export function useRoute() {
  const page = usePage<RoutesPageProps>()
  const { routes, trailingSlash = 'ignore' } = page.props

  const route = useMemo(
    () => <N extends RouteName>(name: N, params?: RouteParams<N>): string => {
      const serializedRoute = routes[name]
      if (!serializedRoute) {
        throw new Error(`Route "${name}" not found.`)
      }
      return applyTrailingSlash(buildUrl(serializedRoute, name, params), trailingSlash)
    },
    [routes, trailingSlash],
  )

  const current = useMemo(
    () => (name?: RouteName): boolean | string | undefined => {
      const pathname = page.url.split('?')[0]

      if (name !== undefined) {
        const serializedRoute = routes[name]
        if (!serializedRoute) return false
        return matchPath(serializedRoute.path, pathname)
      }

      for (const [routeName, routeDef] of Object.entries(routes)) {
        if (matchPath(routeDef.path, pathname)) {
          return routeName
        }
      }
      return undefined
    },
    [routes, page.url],
  )

  return { route, current }
}
