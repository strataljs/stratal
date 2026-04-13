import { createMock } from '@stratal/testing/mocks'
import { OpenAPIHono } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import type { LoggerService } from '../../logger/services/logger.service'
import type { ModuleRegistry } from '../../module/module-registry'
import { Controller } from '../decorators/controller.decorator'
import { Get } from '../decorators/http-method.decorator'
import type { HonoApp } from '../hono-app'
import { RouteRegistry, type RegisteredRoute } from '../route-registry'
import { Router } from '../router'
import { RouterResolver } from '../router-resolver'
import { RouteRegistrationService } from '../services/route-registration.service'
import type { LocalePathService } from '../services/locale-path.service'
import type { VersioningService } from '../services/versioning.service'
import type { RouterEnv } from '../types'

const mockLogger = createMock<LoggerService>()

const mockVersioningService = {
  enabled: false,
  resolve: (path: string) => [path],
} as unknown as VersioningService

const mockLocalePathService = {
  enabled: false,
  localePathConfig: null,
  resolve: (path: string) => [{ path, isLocaleVariant: false }],
} as unknown as LocalePathService

interface CollectRoutesPrivate {
  collectRoutes(
    ControllerClass: new (...args: unknown[]) => object,
    actions: WeakMap<RegisteredRoute, () => void>,
  ): void
}

/**
 * Builds a RouteRegistrationService wired up with the given Router and
 * registers the controller, returning the populated RouteRegistry so tests
 * can assert on the registered route names.
 */
function registerController(
  router: Router,
  ControllerClass: new (...args: unknown[]) => object,
): RouteRegistry {
  const registry = new RouteRegistry(mockVersioningService, mockLocalePathService)
  const resolver = new RouterResolver([{ router, controllers: [ControllerClass] }])
  const mockApp = new OpenAPIHono<RouterEnv>() as unknown as HonoApp
  const mockModuleRegistry = { getAllControllers: () => [ControllerClass] } as unknown as ModuleRegistry
  const service = new RouteRegistrationService(
    mockLogger as unknown as LoggerService,
    registry,
    resolver,
    mockLocalePathService,
    mockApp,
    mockModuleRegistry,
  ) as unknown as CollectRoutesPrivate
  service.collectRoutes(ControllerClass, new WeakMap())
  return registry
}

describe('Route name composition', () => {
  it('concatenates router-level name with controller-level name', () => {
    @Controller('/', { name: 'dashboard.' })
    class DashboardController {
      @Get('/', { name: 'index' })
      index() { /**/ }
    }

    const router = new Router()
    router
      .prefix('/admin/:organizationId')
      .name('admin.')
      .group([DashboardController], () => { /**/ })

    const registry = registerController(router, DashboardController)

    expect(registry.has('admin.dashboard.index')).toBe(true)
    expect(registry.has('dashboard.index')).toBe(false)
  })

  it('uses controller-level name when router has no name', () => {
    @Controller('/users', { name: 'users.' })
    class UsersController {
      @Get('/', { name: 'index' })
      index() { /**/ }
    }

    const router = new Router()
    router.group([UsersController], () => { /**/ })

    const registry = registerController(router, UsersController)

    expect(registry.has('users.index')).toBe(true)
  })

  it('uses router-level name when controller has no name', () => {
    @Controller('/posts')
    class PostsController {
      @Get('/', { name: 'index' })
      index() { /**/ }
    }

    const router = new Router()
    router.name('api.').group([PostsController], () => { /**/ })

    const registry = registerController(router, PostsController)

    expect(registry.has('api.index')).toBe(true)
  })

  it('concatenates module-level name with group-level name and controller-level name', () => {
    @Controller('/', { name: 'dashboard.' })
    class NestedController {
      @Get('/', { name: 'index' })
      index() { /**/ }
    }

    const router = new Router()
    router.name('admin.').group([NestedController], (child) => {
      child.name('v1.')
    })

    const registry = registerController(router, NestedController)

    expect(registry.has('admin.v1.dashboard.index')).toBe(true)
  })
})
