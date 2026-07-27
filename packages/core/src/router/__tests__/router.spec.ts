import { describe, expect, it } from 'vitest'
import { object, string } from 'zod/mini'
import type { Constructor } from '../../types'
import { RouterError } from '../router.error'
import type { Middleware } from '../middleware.interface'
import { Router } from '../router'
import * as internal from '../router.internals'

// Stub middleware classes
class AuthMiddleware { handle() { /**/ } }
class CorsMiddleware { handle() { /**/ } }
class AdminMiddleware { handle() { /**/ } }
class AuditMiddleware { handle() { /**/ } }

// Stub controllers
class UsersController { }
class PostsController { }
class AdminController { }
class HealthController { }

describe('Router', () => {
  describe('fluent API', () => {
    it('should set prefix', () => {
      const router = new Router()
      const result = router.prefix('/:companyId')
      expect(result).toBe(router)
      expect(router[internal.getDefaultEntry]().prefix).toBe('/:companyId')
    })

    it('should set prefix with params schema', () => {
      const router = new Router()
      const paramsSchema = object({ companyId: string() })
      router.prefix('/:companyId', paramsSchema)

      const entry = router[internal.getDefaultEntry]()
      expect(entry.prefix).toBe('/:companyId')
      expect(entry.params).toBe(paramsSchema)
    })

    it('should set domain', () => {
      const router = new Router()
      router.domain('{tenant}.myapp.com')
      expect(router[internal.getDefaultEntry]().domain).toBe('{tenant}.myapp.com')
    })

    it('should set name prefix', () => {
      const router = new Router()
      router.name('api.')
      expect(router[internal.getDefaultEntry]().name).toBe('api.')
    })

    it('should accumulate middleware', () => {
      const router = new Router()
      router.middleware(AuthMiddleware as unknown as Constructor<Middleware>)
      router.middleware(CorsMiddleware as unknown as Constructor<Middleware>)
      expect(router[internal.getDefaultEntry]().middleware).toHaveLength(2)
    })

    it('should set version', () => {
      const router = new Router()
      router.version('1')
      expect(router[internal.getDefaultEntry]().version).toBe('1')
    })

    it('should set version array', () => {
      const router = new Router()
      router.version(['1', '2'])
      expect(router[internal.getDefaultEntry]().version).toEqual(['1', '2'])
    })

    it('should set hideFromDocs', () => {
      const router = new Router()
      router.hideFromDocs()
      expect(router[internal.getDefaultEntry]().hideFromDocs).toBe(true)
    })

    it('should set hideFromDocs to false explicitly', () => {
      const router = new Router()
      router.hideFromDocs(false)
      expect(router[internal.getDefaultEntry]().hideFromDocs).toBe(false)
    })

    it('should chain all methods', () => {
      const router = new Router()
      const result = router
        .prefix('/:companyId')
        .domain('{tenant}.myapp.com')
        .name('tenant.')
        .middleware(AuthMiddleware as unknown as Constructor<Middleware>)
        .version('1')
        .hideFromDocs()

      expect(result).toBe(router)
      const entry = router[internal.getDefaultEntry]()
      expect(entry.prefix).toBe('/:companyId')
      expect(entry.domain).toBe('{tenant}.myapp.com')
      expect(entry.name).toBe('tenant.')
      expect(entry.middleware).toHaveLength(1)
      expect(entry.version).toBe('1')
      expect(entry.hideFromDocs).toBe(true)
    })
  })

  describe('throttle() — named rate limiter', () => {
    it('appends a Throttle middleware class to the default entry', () => {
      const router = new Router()
      const result = router.throttle('api')
      expect(result).toBe(router)

      const middleware = router[internal.getDefaultEntry]().middleware
      expect(middleware).toHaveLength(1)
      expect(middleware[0].name).toBe('Throttle(api)')
    })

    it('two throttle() calls with the same name reuse the same class (memoized)', () => {
      const r1 = new Router()
      r1.throttle('uploads')
      const r2 = new Router()
      r2.throttle('uploads')
      expect(r1[internal.getDefaultEntry]().middleware[0])
        .toBe(r2[internal.getDefaultEntry]().middleware[0])
    })

    it('different names produce different classes', () => {
      const router = new Router()
      router.throttle('api').throttle('uploads')
      const middleware = router[internal.getDefaultEntry]().middleware
      expect(middleware).toHaveLength(2)
      expect(middleware[0].name).toBe('Throttle(api)')
      expect(middleware[1].name).toBe('Throttle(uploads)')
    })

    it('works inside group() callbacks', () => {
      const router = new Router()
      router.group([UsersController], (child) => {
        child.throttle('api')
      })

      const groups = router[internal.getGroups]()
      expect(groups[0].middleware).toHaveLength(1)
      expect(groups[0].middleware[0].name).toBe('Throttle(api)')
    })
  })

  describe('use() — global middleware', () => {
    it('should register global middleware on root router', () => {
      const router = new Router()
      router.use(AuthMiddleware as unknown as Constructor<Middleware>)
      expect(router[internal.getGlobalMiddleware]()).toHaveLength(1)
    })

    it('should accumulate global middleware', () => {
      const router = new Router()
      router.use(AuthMiddleware as unknown as Constructor<Middleware>)
      router.use(CorsMiddleware as unknown as Constructor<Middleware>)
      expect(router[internal.getGlobalMiddleware]()).toHaveLength(2)
    })

    it('should throw RouterError when called inside group()', () => {
      const router = new Router()
      expect(() => {
        router.group([UsersController], (child) => {
          (child as Router).use(AuthMiddleware as unknown as Constructor<Middleware>)
        })
      }).toThrow(RouterError)
    })
  })

  describe('group() — sub-groups', () => {
    it('should create a sub-group with controllers', () => {
      const router = new Router()
      router.group([AdminController], (admin) => {
        admin.middleware(AdminMiddleware as unknown as Constructor<Middleware>)
      })

      const groups = router[internal.getGroups]()
      expect(groups).toHaveLength(1)
      expect(groups[0].controllers).toEqual([AdminController])
      expect(groups[0].middleware).toHaveLength(1)
    })

    it('should allow configuration in callback', () => {
      const router = new Router()
      router.group([AdminController], (admin) => {
        admin
          .prefix('/:companyId')
          .domain('admin.myapp.com')
          .name('admin.')
          .middleware(AdminMiddleware as unknown as Constructor<Middleware>, AuditMiddleware as unknown as Constructor<Middleware>)
          .hideFromDocs()
      })

      const group = router[internal.getGroups]()[0]
      expect(group.prefix).toBe('/:companyId')
      expect(group.domain).toBe('admin.myapp.com')
      expect(group.name).toBe('admin.')
      expect(group.middleware).toHaveLength(2)
      expect(group.hideFromDocs).toBe(true)
    })

    it('should support multiple sub-groups', () => {
      const router = new Router()
      router.group([HealthController], () => { /**/ })
      router.group([UsersController, PostsController], (auth) => {
        auth.middleware(AuthMiddleware as unknown as Constructor<Middleware>)
      })

      expect(router[internal.getGroups]()).toHaveLength(2)
      expect(router[internal.getGroups]()[0].controllers).toEqual([HealthController])
      expect(router[internal.getGroups]()[1].controllers).toEqual([UsersController, PostsController])
    })

    it('should not affect the parent default entry', () => {
      const router = new Router()
      router.name('parent.')
      router.group([AdminController], (admin) => {
        admin.name('admin.')
      })

      expect(router[internal.getDefaultEntry]().name).toBe('parent.')
      expect(router[internal.getGroups]()[0].name).toBe('admin.')
    })
  })
})
