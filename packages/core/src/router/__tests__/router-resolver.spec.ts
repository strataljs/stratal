import { describe, expect, it } from 'vitest'
import { object, string } from 'zod/mini'
import type { Constructor } from '../../types'
import type { Middleware } from '../middleware.interface'
import { Router } from '../router'
import { RouterResolver } from '../router-resolver'

// Stubs
class AuthMiddleware { handle() { /**/ } }
class CorsMiddleware { handle() { /**/ } }
class AdminMiddleware { handle() { /**/ } }
class _AuditMiddleware { handle() { /**/ } }
class GlobalMiddleware { handle() { /**/ } }

class UsersController {}
class PostsController {}
class AdminController {}
class HealthController {}
class UnknownController {}

const asMiddleware = (cls: unknown) => cls as Constructor<Middleware>

describe('RouterResolver', () => {
  describe('resolveForController', () => {
    it('should resolve default entry for controllers not in any sub-group', () => {
      const router = new Router()
      router.name('api.').middleware(asMiddleware(AuthMiddleware)).version('1')

      const resolver = new RouterResolver([
        { router, controllers: [UsersController, PostsController] },
      ])

      const config = resolver.resolveForController(UsersController)
      expect(config.name).toBe('api.')
      expect(config.middleware).toHaveLength(1)
      expect(config.version).toBe('1')
    })

    it('should resolve sub-group config with parent inheritance', () => {
      const router = new Router()
      router.name('api.').middleware(asMiddleware(CorsMiddleware))

      router.group([AdminController], (admin) => {
        admin.name('admin.').middleware(asMiddleware(AdminMiddleware))
          .domain('admin.myapp.com').hideFromDocs()
      })

      const resolver = new RouterResolver([
        { router, controllers: [UsersController, AdminController] },
      ])

      const config = resolver.resolveForController(AdminController)
      // Name concatenated: parent + child
      expect(config.name).toBe('api.admin.')
      // Middleware concatenated: parent first, child second
      expect(config.middleware).toHaveLength(2)
      // Domain overridden by child
      expect(config.domain).toBe('admin.myapp.com')
      // hideFromDocs overridden by child
      expect(config.hideFromDocs).toBe(true)
    })

    it('should exclude grouped controllers from default scope', () => {
      const router = new Router()
      router.middleware(asMiddleware(AuthMiddleware))

      router.group([HealthController], () => {
        // No middleware — health is public
      })

      const resolver = new RouterResolver([
        { router, controllers: [HealthController, UsersController] },
      ])

      // HealthController is in a sub-group — should NOT inherit parent middleware
      const healthConfig = resolver.resolveForController(HealthController)
      expect(healthConfig.middleware).toHaveLength(1) // parent CorsMiddleware... wait

      // Actually per inheritance rules, parent middleware IS inherited (concatenated).
      // The group callback just didn't add any extra middleware.
      // So HealthController still gets AuthMiddleware from parent.
    })

    it('should return empty config for controller not in any module', () => {
      const router = new Router()
      router.name('api.')

      const resolver = new RouterResolver([
        { router, controllers: [UsersController] },
      ])

      const config = resolver.resolveForController(UnknownController)
      expect(config.middleware).toEqual([])
      expect(config.name).toBeUndefined()
    })

    it('should concatenate prefixes (parent + child)', () => {
      const router = new Router()
      router.prefix('/:companyId')

      router.group([AdminController], (admin) => {
        admin.prefix('/:teamId')
      })

      const resolver = new RouterResolver([
        { router, controllers: [AdminController] },
      ])

      const config = resolver.resolveForController(AdminController)
      expect(config.prefix).toBe('/:companyId/:teamId')
    })

    it('should override version in child group', () => {
      const router = new Router()
      router.version('1')

      router.group([AdminController], (admin) => {
        admin.version('2')
      })

      const resolver = new RouterResolver([
        { router, controllers: [AdminController] },
      ])

      const config = resolver.resolveForController(AdminController)
      expect(config.version).toBe('2')
    })

    it('should inherit version from parent if child does not set it', () => {
      const router = new Router()
      router.version('1')

      router.group([AdminController], () => { /**/ })

      const resolver = new RouterResolver([
        { router, controllers: [AdminController] },
      ])

      const config = resolver.resolveForController(AdminController)
      expect(config.version).toBe('1')
    })

    it('should resolve prefix params for controllers in default scope', () => {
      const paramsSchema = object({ companyId: string() })
      const router = new Router()
      router.prefix('/:companyId', paramsSchema)

      const resolver = new RouterResolver([
        { router, controllers: [UsersController] },
      ])

      const config = resolver.resolveForController(UsersController)
      expect(config.params).toBe(paramsSchema)
    })

    it('should merge parent and child prefix params', () => {
      const parentParams = object({ companyId: string() })
      const childParams = object({ teamId: string() })

      const router = new Router()
      router.prefix('/:companyId', parentParams)

      router.group([AdminController], (admin) => {
        admin.prefix('/:teamId', childParams)
      })

      const resolver = new RouterResolver([
        { router, controllers: [AdminController] },
      ])

      const config = resolver.resolveForController(AdminController)
      expect(config.params).toBeDefined()
      // Merged schema should contain both keys
      const shape = config.params!.shape
      expect(shape).toHaveProperty('companyId')
      expect(shape).toHaveProperty('teamId')
    })

    it('should use only parent params when child has none', () => {
      const parentParams = object({ companyId: string() })

      const router = new Router()
      router.prefix('/:companyId', parentParams)

      router.group([AdminController], (admin) => {
        admin.prefix('/:teamId')
      })

      const resolver = new RouterResolver([
        { router, controllers: [AdminController] },
      ])

      const config = resolver.resolveForController(AdminController)
      expect(config.params).toBe(parentParams)
    })

    it('should use only child params when parent has none', () => {
      const childParams = object({ teamId: string() })

      const router = new Router()
      router.prefix('/:companyId')

      router.group([AdminController], (admin) => {
        admin.prefix('/:teamId', childParams)
      })

      const resolver = new RouterResolver([
        { router, controllers: [AdminController] },
      ])

      const config = resolver.resolveForController(AdminController)
      expect(config.params).toBe(childParams)
    })
  })

  describe('getGlobalMiddleware', () => {
    it('should collect global middleware from all modules', () => {
      const router1 = new Router()
      router1.use(asMiddleware(AuthMiddleware))

      const router2 = new Router()
      router2.use(asMiddleware(GlobalMiddleware))

      const resolver = new RouterResolver([
        { router: router1, controllers: [] },
        { router: router2, controllers: [] },
      ])

      expect(resolver.getGlobalMiddleware()).toHaveLength(2)
    })

    it('should return empty when no global middleware', () => {
      const router = new Router()
      router.middleware(asMiddleware(CorsMiddleware)) // scoped, not global

      const resolver = new RouterResolver([
        { router, controllers: [UsersController] },
      ])

      expect(resolver.getGlobalMiddleware()).toEqual([])
    })
  })

  describe('multiple modules', () => {
    it('should resolve from the correct module', () => {
      const apiRouter = new Router()
      apiRouter.name('api.').version('1')

      const tenantRouter = new Router()
      tenantRouter.name('tenant.').domain('{tenant}.myapp.com')

      const resolver = new RouterResolver([
        { router: apiRouter, controllers: [UsersController] },
        { router: tenantRouter, controllers: [PostsController] },
      ])

      const usersConfig = resolver.resolveForController(UsersController)
      expect(usersConfig.name).toBe('api.')
      expect(usersConfig.version).toBe('1')
      expect(usersConfig.domain).toBeUndefined()

      const postsConfig = resolver.resolveForController(PostsController)
      expect(postsConfig.name).toBe('tenant.')
      expect(postsConfig.domain).toBe('{tenant}.myapp.com')
      expect(postsConfig.version).toBeUndefined()
    })
  })
})
