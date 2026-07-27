import { createMock } from '@stratal/testing/mocks'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { LoggerService } from '../../logger/services/logger.service'
import type { ModuleRegistry } from '../../module/module-registry'
import { Controller, getControllerGroups } from '../decorators/controller.decorator'
import { Get } from '../decorators/http-method.decorator'
import type { HonoApp } from '../hono-app'
import { RouteMetadataRegistry, type RouteSchemaMeta } from '../route-metadata'
import { RouteRegistry } from '../route-registry'
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

// groups are written inside the deferred registration action, so the metadata
// registry is only populated after configure() runs both passes.
async function collectMetadata(
  router: Router,
  controllers: (new (...args: unknown[]) => object)[],
): Promise<readonly RouteSchemaMeta[]> {
  const registry = new RouteRegistry(mockVersioningService, mockLocalePathService)
  const resolver = new RouterResolver([{ router, controllers }])
  const mockApp = new Hono<RouterEnv>() as unknown as HonoApp
  const mockModuleRegistry = { getAllControllers: () => controllers } as unknown as ModuleRegistry
  const metadataRegistry = new RouteMetadataRegistry()
  const service = new RouteRegistrationService(
    mockLogger,
    registry,
    resolver,
    mockLocalePathService,
    mockApp,
    mockModuleRegistry,
    metadataRegistry,
  )
  await service.configure()
  return metadataRegistry.all()
}

describe('Route visibility groups', () => {
  it('applies controller-level groups to every route\'s schema metadata', async () => {
    @Controller('/admin', { groups: ['admin'] })
    class AdminController {
      @Get('/', { name: 'index' })
      index() { /**/ }

      @Get('/profile', { name: 'profile' })
      profile() { /**/ }
    }

    const router = new Router()
    router.group([AdminController], () => { /**/ })

    const metas = await collectMetadata(router, [AdminController])

    expect(metas).toHaveLength(2)
    for (const meta of metas) {
      expect(meta.groups).toEqual(['admin'])
    }
  })

  it('appends route-level groups to controller-level groups', async () => {
    @Controller('/reports', { groups: ['admin'] })
    class ReportsController {
      @Get('/', { name: 'index', groups: ['internal'] })
      index() { /**/ }
    }

    const router = new Router()
    router.group([ReportsController], () => { /**/ })

    const metas = await collectMetadata(router, [ReportsController])

    expect(metas).toHaveLength(1)
    expect(metas[0]?.groups).toEqual(['admin', 'internal'])
  })

  it('leaves groups undefined when none are declared', async () => {
    @Controller('/public')
    class PublicController {
      @Get('/', { name: 'index' })
      index() { /**/ }
    }

    const router = new Router()
    router.group([PublicController], () => { /**/ })

    const metas = await collectMetadata(router, [PublicController])

    expect(metas).toHaveLength(1)
    expect(metas[0]?.groups).toBeUndefined()
  })

  it('supports filtering routes by group membership', async () => {
    @Controller('/admin', { groups: ['admin'] })
    class AdminScopedController {
      @Get('/', { name: 'admin.index' })
      index() { /**/ }
    }

    @Controller('/partner', { groups: ['partner'] })
    class PartnerScopedController {
      @Get('/', { name: 'partner.index' })
      index() { /**/ }
    }

    const router = new Router()
    router.group([AdminScopedController, PartnerScopedController], () => { /**/ })

    const metas = await collectMetadata(router, [AdminScopedController, PartnerScopedController])

    const adminOnly = metas.filter(route => route.groups?.includes('admin'))
    expect(adminOnly.map(r => r.path)).toEqual(['/admin'])
  })

  it('reads controller groups via getControllerGroups', () => {
    @Controller('/admin', { groups: ['admin'] })
    class GroupedController { }

    @Controller('/public')
    class BareController { }

    expect(getControllerGroups(GroupedController)).toEqual(['admin'])
    expect(getControllerGroups(BareController)).toBeUndefined()
  })
})
