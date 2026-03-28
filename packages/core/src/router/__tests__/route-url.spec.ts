import { describe, expect, it, vi } from 'vitest'
import { RouteRegistry } from '../route-registry'
import { route } from '../route-url'
import { RouteNameNotFoundError } from '../errors/route-name-not-found.error'
import { MissingRouteParamError } from '../errors/missing-route-param.error'
import { containerStorage } from '../../di/container-storage'
import { ROUTER_TOKENS } from '../router.tokens'
import type { Container } from '../../di/container'
import type { VersioningService } from '../services/versioning.service'
import type { LocalePathService } from '../services/locale-path.service'

const mockVersioningService = {
  enabled: false,
  resolve: (path: string) => [path],
} as unknown as VersioningService

const mockLocalePathService = {
  enabled: false,
  localePathConfig: null,
  resolve: (path: string) => [{ path, isLocaleVariant: false }],
} as unknown as LocalePathService

const createRegistry = (): RouteRegistry => {
  return new RouteRegistry(mockVersioningService, mockLocalePathService)
}

const runWithRegistry = <T>(registry: RouteRegistry, fn: () => T): T => {
  const mockContainer = {
    resolve: vi.fn().mockImplementation((token: symbol) => {
      if (token === ROUTER_TOKENS.RouteRegistry) return registry
      throw new Error(`Unexpected token: ${String(token)}`)
    }),
  }
  return containerStorage.run(mockContainer as unknown as Container, fn)
}

describe('route() URL generation', () => {
  it('should generate URL for a simple route', () => {
    const registry = createRegistry()
    registry.register({
      name: 'users.index',
      method: 'get',
      basePath: '/users',
      controller: 'UsersController',
      action: 'index',
      hidden: false,
      middleware: [],
    })

    runWithRegistry(registry, () => {
      expect(route('users.index')).toBe('/users')
    })
  })

  it('should fill path params', () => {
    const registry = createRegistry()
    registry.register({
      name: 'users.show',
      method: 'get',
      basePath: '/users/:id',
      controller: 'UsersController',
      action: 'show',
      hidden: false,
      middleware: [],
    })

    runWithRegistry(registry, () => {
      expect(route('users.show', { id: '42' })).toBe('/users/42')
    })
  })

  it('should append extra params as query string', () => {
    const registry = createRegistry()
    registry.register({
      name: 'users.show',
      method: 'get',
      basePath: '/users/:id',
      controller: 'UsersController',
      action: 'show',
      hidden: false,
      middleware: [],
    })

    runWithRegistry(registry, () => {
      const url = route('users.show', { id: '1', search: 'rocket' })
      expect(url).toBe('/users/1?search=rocket')
    })
  })

  it('should generate domain-prefixed URL', () => {
    const registry = createRegistry()
    registry.register({
      name: 'tenant.dashboard',
      method: 'get',
      basePath: '/dashboard',
      domain: '{tenant}.myapp.com',
      controller: 'DashboardController',
      action: 'index',
      hidden: false,
      middleware: [],
    })

    runWithRegistry(registry, () => {
      expect(route('tenant.dashboard', { tenant: 'acme' })).toBe('https://acme.myapp.com/dashboard')
    })
  })

  it('should consume both domain and path params from same object', () => {
    const registry = createRegistry()
    registry.register({
      name: 'tenant.users.show',
      method: 'get',
      basePath: '/users/:id',
      domain: '{tenant}.myapp.com',
      controller: 'UsersController',
      action: 'show',
      hidden: false,
      middleware: [],
    })

    runWithRegistry(registry, () => {
      expect(route('tenant.users.show', { tenant: 'acme', id: '5' }))
        .toBe('https://acme.myapp.com/users/5')
    })
  })

  it('should throw RouteNameNotFoundError for unknown route name', () => {
    const registry = createRegistry()

    runWithRegistry(registry, () => {
      expect(() => route('nonexistent')).toThrow(RouteNameNotFoundError)
    })
  })

  it('should throw MissingRouteParamError for missing required params', () => {
    const registry = createRegistry()
    registry.register({
      name: 'users.show',
      method: 'get',
      basePath: '/users/:id',
      controller: 'UsersController',
      action: 'show',
      hidden: false,
      middleware: [],
    })

    runWithRegistry(registry, () => {
      expect(() => route('users.show')).toThrow(MissingRouteParamError)
    })
  })
})
