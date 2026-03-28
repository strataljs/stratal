import { describe, expect, it, beforeEach } from 'vitest'
import { RouteRegistry, type RouteRegistrationInput } from '../route-registry'
import { DuplicateRouteNameError } from '../errors/duplicate-route-name.error'
import { RouteNameNotFoundError } from '../errors/route-name-not-found.error'
import { MissingRouteParamError } from '../errors/missing-route-param.error'
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

const createInput = (overrides: Partial<RouteRegistrationInput> = {}): RouteRegistrationInput => ({
  method: 'get',
  basePath: '/users',
  controller: 'UsersController',
  action: 'index',
  hidden: false,
  middleware: [],
  ...overrides,
})

describe('RouteRegistry', () => {
  let registry: RouteRegistry

  beforeEach(() => {
    registry = new RouteRegistry(mockVersioningService, mockLocalePathService)
  })

  describe('register', () => {
    it('should register a named route', () => {
      registry.register(createInput({ name: 'users.index' }))
      expect(registry.has('users.index')).toBe(true)
    })

    it('should register an unnamed route', () => {
      registry.register(createInput())
      expect(registry.all()).toHaveLength(1)
    })

    it('should throw DuplicateRouteNameError on duplicate named routes', () => {
      registry.register(createInput({ name: 'users.index' }))
      expect(() =>
        registry.register(createInput({ name: 'users.index', controller: 'OtherController', action: 'list' }))
      ).toThrow(DuplicateRouteNameError)
    })

    it('should allow multiple unnamed routes', () => {
      registry.register(createInput())
      registry.register(createInput({ basePath: '/posts', controller: 'PostsController' }))
      expect(registry.all()).toHaveLength(2)
    })

    it('should return expanded routes', () => {
      const result = registry.register(createInput({ name: 'users.index' }))
      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('/users')
      expect(result[0].name).toBe('users.index')
    })

    it('should auto-extract paramNames from basePath', () => {
      const result = registry.register(createInput({ basePath: '/users/:id' }))
      expect(result[0].paramNames).toEqual(['id'])
    })

    it('should auto-extract domainParamNames from domain', () => {
      const result = registry.register(createInput({
        basePath: '/dashboard',
        domain: '{tenant}.myapp.com',
      }))
      expect(result[0].domainParamNames).toEqual(['tenant'])
    })
  })

  describe('get', () => {
    it('should return a named route', () => {
      registry.register(createInput({ name: 'users.index' }))
      expect(registry.get('users.index')).toMatchObject({ name: 'users.index' })
    })

    it('should return undefined for unknown name', () => {
      expect(registry.get('nonexistent')).toBeUndefined()
    })
  })

  describe('has', () => {
    it('should return true for existing named route', () => {
      registry.register(createInput({ name: 'users.index' }))
      expect(registry.has('users.index')).toBe(true)
    })

    it('should return false for unknown name', () => {
      expect(registry.has('nonexistent')).toBe(false)
    })
  })

  describe('all', () => {
    it('should return all routes sorted by specificity', () => {
      registry.register(createInput({ basePath: '/users/:id' }))
      registry.register(createInput({ basePath: '/users/create' }))

      const routes = registry.all()
      expect(routes.map(r => r.path)).toEqual([
        '/users/create',
        '/users/:id',
      ])
    })

    it('should return empty array when no routes', () => {
      expect(registry.all()).toEqual([])
    })
  })

  describe('named', () => {
    it('should return only named routes', () => {
      registry.register(createInput({ name: 'users.index' }))
      registry.register(createInput({ basePath: '/health' })) // unnamed
      registry.register(createInput({ name: 'users.show', basePath: '/users/:id' }))

      const named = registry.named()
      expect(named).toHaveLength(2)
      expect(named.map(r => r.name)).toEqual(['users.index', 'users.show'])
    })
  })

  describe('url', () => {
    it('should generate URL for simple route', () => {
      registry.register(createInput({ name: 'users.index', basePath: '/users' }))
      expect(registry.url('users.index')).toBe('/users')
    })

    it('should fill path params', () => {
      registry.register(createInput({
        name: 'users.show',
        basePath: '/users/:id',
      }))
      expect(registry.url('users.show', { id: '42' })).toBe('/users/42')
    })

    it('should fill multiple path params', () => {
      registry.register(createInput({
        name: 'notes.show',
        basePath: '/users/:userId/notes/:noteId',
      }))
      expect(registry.url('notes.show', { userId: '1', noteId: '99' })).toBe('/users/1/notes/99')
    })

    it('should append extra params as query string', () => {
      registry.register(createInput({
        name: 'users.show',
        basePath: '/users/:id',
      }))
      expect(registry.url('users.show', { id: '1', search: 'rocket' })).toBe('/users/1?search=rocket')
    })

    it('should handle query string with multiple extras', () => {
      registry.register(createInput({ name: 'users.index', basePath: '/users' }))
      const url = registry.url('users.index', { page: '2', limit: '10' })
      expect(url).toContain('/users?')
      expect(url).toContain('page=2')
      expect(url).toContain('limit=10')
    })

    it('should generate domain-prefixed URL', () => {
      registry.register(createInput({
        name: 'tenant.dashboard',
        basePath: '/dashboard',
        domain: '{tenant}.myapp.com',
      }))
      expect(registry.url('tenant.dashboard', { tenant: 'acme' })).toBe('https://acme.myapp.com/dashboard')
    })

    it('should consume domain params from the same params object', () => {
      registry.register(createInput({
        name: 'tenant.users.show',
        basePath: '/users/:id',
        domain: '{tenant}.myapp.com',
      }))
      expect(registry.url('tenant.users.show', { tenant: 'acme', id: '5' })).toBe('https://acme.myapp.com/users/5')
    })

    it('should encode param values', () => {
      registry.register(createInput({
        name: 'users.show',
        basePath: '/users/:id',
      }))
      expect(registry.url('users.show', { id: 'hello world' })).toBe('/users/hello%20world')
    })

    it('should throw RouteNameNotFoundError for unknown route name', () => {
      expect(() => registry.url('nonexistent')).toThrow(RouteNameNotFoundError)
    })

    it('should throw MissingRouteParamError for missing required path param', () => {
      registry.register(createInput({
        name: 'users.show',
        basePath: '/users/:id',
      }))
      expect(() => registry.url('users.show')).toThrow(MissingRouteParamError)
    })

    it('should throw MissingRouteParamError for missing required domain param', () => {
      registry.register(createInput({
        name: 'tenant.dashboard',
        basePath: '/dashboard',
        domain: '{tenant}.myapp.com',
      }))
      expect(() => registry.url('tenant.dashboard')).toThrow(MissingRouteParamError)
    })
  })
})
