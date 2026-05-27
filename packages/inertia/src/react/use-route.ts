/**
 * React hook for Ziggy-like client-side URL generation.
 *
 * Reads serialized routes and the current request's matched-route snapshot
 * (injected by the `routes` option on {@link InertiaModuleOptions}) and
 * provides a type-safe `route()` function that mirrors the server-side
 * `buildRouteUrl()`, plus `current()` and `params` for current-route
 * introspection.
 *
 * @module
 */

import type { PageProps } from '@inertiajs/core'
import { usePage } from '@inertiajs/react'
import { useMemo } from 'react'
import type { CurrentRoute, LocaleUrlConfig, RouteMatcher, RouteName, RouteParams, SerializedRoute, SerializedRoutes, TrailingSlashMode } from 'stratal/router'

interface RoutesPageProps extends PageProps {
  routes: SerializedRoutes
  trailingSlash?: TrailingSlashMode
  route: CurrentRoute
  localeConfig?: LocaleUrlConfig
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

/**
 * Encode a path-param value while preserving forward slashes so catch-all
 * params (`:slug{.+}`) round-trip cleanly. Mirrors the server-side
 * `encodePathParam()` in `stratal/router`.
 */
function encodePathParam(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/')
}

/**
 * Build a URL from a serialized route definition.
 *
 * Mirrors `buildRouteUrl()` from `stratal/router` (pure reimplementation to
 * avoid pulling server-side dependencies into the browser bundle).
 */
function buildUrl(route: SerializedRoute, name: string, params?: Record<string, string>, localeConfig?: LocaleUrlConfig): string {
  const allParams = { ...params }
  const consumedKeys = new Set<string>()
  let url = route.path

  if (allParams.locale && route.localePaths?.length) {
    const shouldPrefix = !localeConfig
      || localeConfig.prefixDefaultLocale === true
      || allParams.locale !== localeConfig.defaultLocale
    if (shouldPrefix) {
      url = `/${allParams.locale}${url === '/' ? '' : url}`
    }
    consumedKeys.add('locale')
  }

  for (const paramName of route.paramNames) {
    const value = allParams[paramName]
    if (value === undefined) {
      throw new Error(`Missing required parameter "${paramName}" for route "${name}" (path: ${route.path})`)
    }
    url = url.replace(
      new RegExp(`:${paramName}(\\{[^}]*\\})?`),
      encodePathParam(value),
    )
    consumedKeys.add(paramName)
  }

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

  const queryEntries = Object.entries(allParams).filter(([key]) => !consumedKeys.has(key))
  if (queryEntries.length > 0) {
    const queryString = queryEntries
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    url = `${url}${queryString.length ? `?${queryString}` : ''}`
  }

  if (domain) {
    url = `https://${domain}${url}`
  }

  return url
}

/**
 * Filter a param bag down to the keys the target route actually declares —
 * so a `companyId` carried over from the current URL never leaks into the
 * query string of an unrelated route.
 */
function filterCarryover(carryover: Record<string, string>, route: SerializedRoute): Record<string, string> {
  const allowed = new Set<string>([...route.paramNames, ...route.domainParamNames])
  if (route.localePaths?.length) allowed.add('locale')
  if (allowed.size === 0) return {}

  const filtered: Record<string, string> = {}
  for (const [key, value] of Object.entries(carryover)) {
    if (allowed.has(key)) filtered[key] = value
  }
  return filtered
}

/**
 * Pure URL resolver. Mirrors what {@link useRoute}'s `route()` does, but
 * without React — exposed for testing and for non-hook callers.
 *
 * Merges params in order (last wins): sticky `defaults`, current-route
 * carryover (filtered to the target's declared params), explicit params.
 */
export function resolveUrl<N extends RouteName>(
  name: N,
  explicitParams: RouteParams<N> | undefined,
  routes: SerializedRoutes,
  currentRoute: CurrentRoute,
  trailingSlash: TrailingSlashMode = 'ignore',
  localeConfig?: LocaleUrlConfig,
): string {
  const target = routes[name]
  if (!target) {
    throw new Error(`Route "${name}" not found.`)
  }

  const merged = {
    ...currentRoute.defaults,
    ...filterCarryover(currentRoute.params, target),
    ...explicitParams,
  } as Record<string, string>

  return applyTrailingSlash(buildUrl(target, name, merged, localeConfig), trailingSlash)
}

/**
 * Pure overload signatures for {@link matchCurrent} / `useRoute().current()`.
 *
 * - No arg → matched route name (or `null`).
 * - With a name → `true`/`false`. Strict-typed: only real route names and
 *   dotted wildcard prefixes (`'users.*'`) are accepted.
 */
export function matchCurrent(currentRoute: CurrentRoute): RouteName | null
export function matchCurrent(currentRoute: CurrentRoute, name: RouteMatcher): boolean
export function matchCurrent(currentRoute: CurrentRoute, name?: RouteMatcher): RouteName | null | boolean {
  if (name === undefined) return currentRoute.name
  if (currentRoute.name === null) return false
  if (typeof name === 'string' && name.endsWith('.*')) {
    const prefix = name.slice(0, -1)
    return currentRoute.name.startsWith(prefix)
  }
  return currentRoute.name === name
}

/**
 * Hook that provides Ziggy-like route URL generation in React components.
 *
 * Consumes `routes` and the current-request snapshot (`route`) from Inertia
 * shared props. Route names and params are strictly typed from
 * `StratalRouteMap` (generated by `quarry route:types`).
 *
 * Requires the `routes` option to be set on `InertiaModule.forRoot()`.
 *
 * Sticky params — anything in `defaults` (set server-side via `Uri.defaults()`)
 * and anything in the current route's extracted `params` (filtered to the
 * target route's declared params) — are merged into every `route()` call.
 * Explicit params always win.
 *
 * @returns
 * - `route(name, params?)` — URL builder
 * - `current()` / `current(name)` — matched route name (or wildcard match)
 * - `params` — extracted params for the current request URL
 *
 * @example
 * ```tsx
 * import { useRoute } from '@stratal/inertia/react'
 *
 * export default function UserProfile({ user }) {
 *   const { route, current, currentRoute } = useRoute()
 *
 *   return (
 *     <nav>
 *       <a href={route('users.index')}>All Users</a>
 *       <a href={route('users.show', { id: user.id })}>{user.name}</a>
 *       {current('users.*') && <span>On a users page</span>}
 *       {currentRoute.name === 'users.show' && <span>#{currentRoute.params.id}</span>}
 *     </nav>
 *   )
 * }
 * ```
 */
export function useRoute() {
  const page = usePage<RoutesPageProps>()
  const { routes, trailingSlash = 'ignore', route: currentRoute, localeConfig } = page.props

  const route = useMemo(
    () => <N extends RouteName>(name: N, params?: RouteParams<N>): string =>
      resolveUrl(name, params, routes, currentRoute, trailingSlash, localeConfig),
    [routes, trailingSlash, currentRoute, localeConfig],
  )

  const current = useMemo(
    () => {
      function impl(): RouteName | null
      function impl(name: RouteMatcher): boolean
      function impl(name?: RouteMatcher): RouteName | null | boolean {
        return name === undefined ? matchCurrent(currentRoute) : matchCurrent(currentRoute, name)
      }
      return impl
    },
    [currentRoute],
  )

  return { route, current, currentRoute, params: currentRoute.params }
}
