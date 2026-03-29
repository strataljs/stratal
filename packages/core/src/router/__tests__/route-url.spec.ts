import { describe, expect, it } from 'vitest'
import { route } from '../route-url'
import { RouteNameNotFoundError } from '../errors/route-name-not-found.error'
import { MissingRouteParamError } from '../errors/missing-route-param.error'
import { containerStorage } from '../../di/container-storage'
import { ROUTER_TOKENS } from '../router.tokens'
import type { Container } from '../../di/container'
import type { RegisteredRoute } from '../route-registry'

const createRoute = (overrides: Partial<RegisteredRoute> = {}): RegisteredRoute => ({
  method: 'get',
  path: '/users',
  paramNames: [],
  domainParamNames: [],
  controller: 'UsersController',
  action: 'index',
  hidden: false,
  middleware: [],
  ...overrides,
})

const createMockRegistry = (routes: Record<string, RegisteredRoute>) => ({
  get: (name: string) => routes[name],
})

const runWithRegistry = <T>(routes: Record<string, RegisteredRoute>, fn: () => T): T => {
  const mockRegistry = createMockRegistry(routes)
  const mockContainer = {
    resolve: (token: symbol) => {
      if (token === ROUTER_TOKENS.RouteRegistry) return mockRegistry
      throw new Error(`Unexpected token: ${String(token)}`)
    },
  }
  return containerStorage.run(mockContainer as unknown as Container, fn)
}

describe('route() URL generation', () => {
  it('should generate URL for a simple route', () => {
    runWithRegistry({ 'users.index': createRoute() }, () => {
      expect(route('users.index')).toBe('/users')
    })
  })

  it('should fill path params', () => {
    runWithRegistry({
      'users.show': createRoute({ path: '/users/:id', paramNames: ['id'] }),
    }, () => {
      expect(route('users.show', { id: '42' })).toBe('/users/42')
    })
  })

  it('should append extra params as query string', () => {
    runWithRegistry({
      'users.show': createRoute({ path: '/users/:id', paramNames: ['id'] }),
    }, () => {
      const url = route('users.show', { id: '1', search: 'rocket' })
      expect(url).toBe('/users/1?search=rocket')
    })
  })

  it('should generate domain-prefixed URL', () => {
    runWithRegistry({
      'tenant.dashboard': createRoute({
        path: '/dashboard',
        domain: '{tenant}.myapp.com',
        domainParamNames: ['tenant'],
      }),
    }, () => {
      expect(route('tenant.dashboard', { tenant: 'acme' })).toBe('https://acme.myapp.com/dashboard')
    })
  })

  it('should consume both domain and path params from same object', () => {
    runWithRegistry({
      'tenant.users.show': createRoute({
        path: '/users/:id',
        paramNames: ['id'],
        domain: '{tenant}.myapp.com',
        domainParamNames: ['tenant'],
      }),
    }, () => {
      expect(route('tenant.users.show', { tenant: 'acme', id: '5' }))
        .toBe('https://acme.myapp.com/users/5')
    })
  })

  it('should throw RouteNameNotFoundError for unknown route name', () => {
    runWithRegistry({}, () => {
      expect(() => route('nonexistent')).toThrow(RouteNameNotFoundError)
    })
  })

  it('should throw MissingRouteParamError for missing required params', () => {
    runWithRegistry({
      'users.show': createRoute({ path: '/users/:id', paramNames: ['id'] }),
    }, () => {
      expect(() => route('users.show')).toThrow(MissingRouteParamError)
    })
  })

  it('should prepend locale segment when locale param and localePaths present', () => {
    runWithRegistry({
      'users.index': createRoute({
        path: '/users',
        localePaths: ['/:locale{en|fr}/users'],
      }),
    }, () => {
      expect(route('users.index', { locale: 'fr' })).toBe('/fr/users')
    })
  })
})
