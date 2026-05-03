import { beforeEach, describe, expect, it } from 'vitest'
import { DuplicateRouteNameError } from '../errors'
import { RouteRegistry, type RouteRegistrationInput } from '../route-registry'
import type { LocalePathService } from '../services/locale-path.service'
import type { VersioningService } from '../services/versioning.service'

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

  describe('findNameByRoute', () => {
    it('resolves the primary path back to the route name', () => {
      registry.register(createInput({ name: 'users.show', basePath: '/users/:id' }))
      expect(registry.findNameByRoute('get', '/users/:id')).toBe('users.show')
    })

    it('matches the request method case-insensitively', () => {
      registry.register(createInput({ name: 'users.show', basePath: '/users/:id' }))
      expect(registry.findNameByRoute('GET', '/users/:id')).toBe('users.show')
    })

    it('disambiguates routes that share a path but differ by method', () => {
      registry.register(createInput({ name: 'school.show', basePath: '/dashboard/settings/school' }))
      registry.register(createInput({
        name: 'school.delete',
        method: 'delete',
        basePath: '/dashboard/settings/school',
        controller: 'SchoolController',
        action: 'destroy',
      }))

      expect(registry.findNameByRoute('GET', '/dashboard/settings/school')).toBe('school.show')
      expect(registry.findNameByRoute('DELETE', '/dashboard/settings/school')).toBe('school.delete')
    })

    it('resolves a route registered with method "all" under any concrete verb', () => {
      registry.register(createInput({ name: 'health', method: 'all', basePath: '/health' }))

      expect(registry.findNameByRoute('GET', '/health')).toBe('health')
      expect(registry.findNameByRoute('POST', '/health')).toBe('health')
      expect(registry.findNameByRoute('DELETE', '/health')).toBe('health')
    })

    it('resolves locale variant paths to the canonical primary name', () => {
      const localeAware = {
        enabled: true,
        localePathConfig: null,
        resolve: (path: string) => [
          { path, isLocaleVariant: false },
          { path: `/:locale{en|de|fr}${path}`, isLocaleVariant: true },
        ],
      } as unknown as LocalePathService
      const r = new RouteRegistry(mockVersioningService, localeAware)
      r.register(createInput({ name: 'users.show', basePath: '/users/:id' }))

      expect(r.findNameByRoute('get', '/users/:id')).toBe('users.show')
      expect(r.findNameByRoute('get', '/:locale{en|de|fr}/users/:id')).toBe('users.show')
    })

    it('returns undefined for unknown paths', () => {
      registry.register(createInput({ name: 'users.index' }))
      expect(registry.findNameByRoute('get', '/posts')).toBeUndefined()
    })

    it('returns undefined when the path is registered under a different method', () => {
      registry.register(createInput({ name: 'users.index' }))
      expect(registry.findNameByRoute('post', '/users')).toBeUndefined()
    })

    it('invalidates the cache when new routes are registered', () => {
      registry.register(createInput({ name: 'users.index' }))
      expect(registry.findNameByRoute('get', '/users')).toBe('users.index')

      registry.register(createInput({ name: 'posts.index', basePath: '/posts' }))
      expect(registry.findNameByRoute('get', '/posts')).toBe('posts.index')
    })
  })

})
