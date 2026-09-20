import type { Context } from 'hono'
import type { Application } from 'stratal'
import { DI_TOKENS } from 'stratal/di'
import { ROUTER_CONTEXT_KEYS, ROUTER_TOKENS, RouterContext, type RegisteredRoute, type RouteRegistry, type RouterEnv, type TrailingSlashConfig } from 'stratal/router'
import { vi } from 'vitest'

export interface MockRouterContextOverrides {
  url?: string
  headers?: Record<string, string>
  isInertia?: boolean
  routes?: RegisteredRoute[]
  trailingSlash?: TrailingSlashConfig
  routePath?: string
  validatedParams?: Record<string, string>
  defaults?: Record<string, string>
}

/**
 * A `RouterContext` over a hand-built Hono context — enough of one for
 * `InertiaService.render()` to run without booting an application.
 */
export function createMockContext(overrides: MockRouterContextOverrides = {}): RouterContext {
  const headers = new Headers(overrides.headers ?? {})
  if (overrides.isInertia) {
    headers.set('x-inertia', 'true')
  }

  const mockRegistry = {
    named: () => overrides.routes ?? [],
    findNameByRoute: (method: string, path: string) => {
      const m = method.toLowerCase()
      return overrides.routes?.find(r => r.path === path && (r.method === m || r.method === 'all'))?.name
    },
  } as unknown as RouteRegistry

  const mockApplication = {
    config: { trailingSlash: overrides.trailingSlash },
  } as unknown as Application

  const mockUri = {
    getDefaults: () => overrides.defaults ?? {},
  }

  const mockLocalePathService = {
    localePathConfig: null,
    prefixDefaultLocale: false,
  }

  const mockContainer = {
    resolve: (token: symbol) => {
      if (token === ROUTER_TOKENS.RouteRegistry) return mockRegistry
      if (token === DI_TOKENS.Application) return mockApplication
      if (token === ROUTER_TOKENS.Uri) return mockUri
      if (token === ROUTER_TOKENS.LocalePathService) return mockLocalePathService
      throw new Error(`Unexpected token: ${String(token)}`)
    },
  }

  const variables: Record<string, unknown> = {
    inertia: overrides.isInertia ?? false,
    inertiaFlash: {},
    inertiaFlashOut: {},
    [ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER]: mockContainer,
  }

  const c = {
    req: {
      url: overrides.url ?? 'http://localhost/',
      method: 'GET',
      routePath: overrides.routePath ?? '/',
      header: (name: string) => headers.get(name) ?? undefined,
      valid: (target: string) => target === 'param' ? (overrides.validatedParams ?? {}) : {},
    },
    get: (key: string) => variables[key],
    set: (key: string, value: unknown) => { variables[key] = value },
    header: vi.fn(),
    status: vi.fn(),
    res: { status: 200 },
  } as unknown as Context<RouterEnv>

  return new RouterContext(c)
}
