import { describe, expect, it } from 'vitest'
import { RouteRegistry } from '../route-registry'
import { route } from '../route-url'

describe('route() URL generation', () => {
  it('should generate URL for a simple route', () => {
    const registry = new RouteRegistry()
    registry.register(RouteRegistry.createRoute({
      name: 'users.index',
      method: 'get',
      path: '/users',
      controller: 'UsersController',
      action: 'index',
      hidden: false,
      middleware: [],
    }))

    expect(route(registry, 'users.index')).toBe('/users')
  })

  it('should fill path params', () => {
    const registry = new RouteRegistry()
    registry.register(RouteRegistry.createRoute({
      name: 'users.show',
      method: 'get',
      path: '/users/:id',
      controller: 'UsersController',
      action: 'show',
      hidden: false,
      middleware: [],
    }))

    expect(route(registry, 'users.show', { id: '42' })).toBe('/users/42')
  })

  it('should append extra params as query string', () => {
    const registry = new RouteRegistry()
    registry.register(RouteRegistry.createRoute({
      name: 'users.show',
      method: 'get',
      path: '/users/:id',
      controller: 'UsersController',
      action: 'show',
      hidden: false,
      middleware: [],
    }))

    const url = route(registry, 'users.show', { id: '1', search: 'rocket' })
    expect(url).toBe('/users/1?search=rocket')
  })

  it('should generate domain-prefixed URL', () => {
    const registry = new RouteRegistry()
    registry.register(RouteRegistry.createRoute({
      name: 'tenant.dashboard',
      method: 'get',
      path: '/dashboard',
      domain: '{tenant}.myapp.com',
      controller: 'DashboardController',
      action: 'index',
      hidden: false,
      middleware: [],
    }))

    expect(route(registry, 'tenant.dashboard', { tenant: 'acme' })).toBe('https://acme.myapp.com/dashboard')
  })

  it('should consume both domain and path params from same object', () => {
    const registry = new RouteRegistry()
    registry.register(RouteRegistry.createRoute({
      name: 'tenant.users.show',
      method: 'get',
      path: '/users/:id',
      domain: '{tenant}.myapp.com',
      controller: 'UsersController',
      action: 'show',
      hidden: false,
      middleware: [],
    }))

    expect(route(registry, 'tenant.users.show', { tenant: 'acme', id: '5' }))
      .toBe('https://acme.myapp.com/users/5')
  })

  it('should throw for unknown route name', () => {
    const registry = new RouteRegistry()
    expect(() => route(registry, 'nonexistent')).toThrow("Route 'nonexistent' not found")
  })

  it('should throw for missing required params', () => {
    const registry = new RouteRegistry()
    registry.register(RouteRegistry.createRoute({
      name: 'users.show',
      method: 'get',
      path: '/users/:id',
      controller: 'UsersController',
      action: 'show',
      hidden: false,
      middleware: [],
    }))

    expect(() => route(registry, 'users.show')).toThrow("Missing required param 'id'")
  })
})
