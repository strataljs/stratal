import { OpenAPIHono } from '@hono/zod-openapi'
import { injectable } from 'tsyringe'
import { bench, describe } from 'vitest'
import { z } from '../../i18n/validation'
import type { LoggerService } from '../../logger'
import type { ModuleRegistry } from '../../module/module-registry'
import type { Constructor } from '../../types'
import { Controller } from '../decorators/controller.decorator'
import { Route } from '../decorators/route.decorator'
import type { HonoApp } from '../hono-app'
import type { RegisteredRoute } from '../route-registry'
import { RouteRegistry } from '../route-registry'
import type { RouterContext } from '../router-context'
import type { LocalePathService } from '../services/locale-path.service'
import { RouteRegistrationService } from '../services/route-registration.service'
import type { VersioningService } from '../services/versioning.service'
import type { RouterEnv } from '../types'
import { sortRoutesBySpecificity } from '../utils/path'
import { extractParamNames } from '../utils/route-name'

// No-op logger to avoid measuring logging overhead
const noopLogger = {
  info: () => null,
  warn: () => null,
  error: () => null,
  debug: () => null,
} as unknown as LoggerService

const mockVersioningService = {
  enabled: false,
  resolve: (path: string) => [path],
} as unknown as VersioningService

const mockLocalePathService = {
  enabled: false,
  localePathConfig: null,
  resolve: (path: string) => [{ path, isLocaleVariant: false }],
} as unknown as LocalePathService

// Fixture: controller with multiple OpenAPI routes

@Controller('/api/bench/items')
@injectable()
class ItemsController {
  @Route({
    summary: 'List items',
    response: z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })) }),
  })
  index(_ctx: RouterContext) {
    return new Response(JSON.stringify({ items: [] }))
  }

  @Route({
    summary: 'Get item',
    params: z.object({ id: z.string() }),
    response: z.object({ id: z.string(), name: z.string() }),
  })
  show(_ctx: RouterContext) {
    return new Response(JSON.stringify({ id: '1', name: 'test' }))
  }

  @Route({
    summary: 'Create item',
    body: z.object({ name: z.string() }),
    response: z.object({ id: z.string(), name: z.string() }),
  })
  create(_ctx: RouterContext) {
    return new Response(JSON.stringify({ id: '1', name: 'test' }), { status: 201 })
  }

  @Route({
    summary: 'Update item',
    params: z.object({ id: z.string() }),
    body: z.object({ name: z.string() }),
    response: z.object({ id: z.string(), name: z.string() }),
  })
  update(_ctx: RouterContext) {
    return new Response(JSON.stringify({ id: '1', name: 'updated' }))
  }

  @Route({
    summary: 'Delete item',
    params: z.object({ id: z.string() }),
    response: z.object({ success: z.boolean() }),
  })
  destroy(_ctx: RouterContext) {
    return new Response(JSON.stringify({ success: true }))
  }
}

@Controller('/api/bench/simple')
@injectable()
class SimpleController {
  @Route({
    summary: 'Simple endpoint',
    response: z.object({ ok: z.boolean() }),
  })
  index(_ctx: RouterContext) {
    return new Response(JSON.stringify({ ok: true }))
  }
}

const createMockModuleRegistry = (controllers: Constructor[]): ModuleRegistry => ({
  getAllControllers: () => controllers,
} as unknown as ModuleRegistry)

describe('RouteRegistration - Configure', () => {
  bench('register controller with 5 OpenAPI routes', async () => {
    const app = new OpenAPIHono<RouterEnv>() as unknown as HonoApp
    const controllers = [ItemsController as unknown as Constructor]
    const service = new RouteRegistrationService(
      noopLogger,
      new RouteRegistry(mockVersioningService, mockLocalePathService),
      null,
      mockLocalePathService,
      app,
      createMockModuleRegistry(controllers),
    )
    await service.configure()
  })

  bench('register single-route controller', async () => {
    const app = new OpenAPIHono<RouterEnv>() as unknown as HonoApp
    const controllers = [SimpleController as unknown as Constructor]
    const service = new RouteRegistrationService(
      noopLogger,
      new RouteRegistry(mockVersioningService, mockLocalePathService),
      null,
      mockLocalePathService,
      app,
      createMockModuleRegistry(controllers),
    )
    await service.configure()
  })

  bench('register multiple controllers', async () => {
    const app = new OpenAPIHono<RouterEnv>() as unknown as HonoApp
    const controllers = [
      ItemsController as unknown as Constructor,
      SimpleController as unknown as Constructor,
    ]
    const service = new RouteRegistrationService(
      noopLogger,
      new RouteRegistry(mockVersioningService, mockLocalePathService),
      null,
      mockLocalePathService,
      app,
      createMockModuleRegistry(controllers),
    )
    await service.configure()
  })
})

// --- Route Sorting Benchmarks ---

function createMockRoutes(count: number): RegisteredRoute[] {
  const routes: RegisteredRoute[] = []
  for (let i = 0; i < count; i++) {
    const isParam = i % 3 === 1
    const isWildcard = i % 7 === 0 && i > 0
    const path = isWildcard
      ? `/api/resource${i}/:path{.+}`
      : isParam
        ? `/api/resource${i}/:id`
        : `/api/resource${i}`
    routes.push({
      method: 'get',
      path,
      paramNames: isParam || isWildcard ? ['id'] : [],
      domainParamNames: [],
      controller: `Controller${i}`,
      action: 'index',
      hidden: false,
      middleware: [],
    })
  }
  return routes
}

describe('Route Sorting', () => {
  const routes10 = createMockRoutes(10)
  const routes50 = createMockRoutes(50)
  const routes100 = createMockRoutes(100)

  bench('sort 10 routes by specificity', () => {
    sortRoutesBySpecificity(routes10)
  })

  bench('sort 50 routes by specificity', () => {
    sortRoutesBySpecificity(routes50)
  })

  bench('sort 100 routes by specificity', () => {
    sortRoutesBySpecificity(routes100)
  })
})

// --- Param Extraction Benchmarks ---

describe('Param Extraction', () => {
  bench('extractParamNames - static path', () => {
    extractParamNames('/api/users')
  })

  bench('extractParamNames - single param', () => {
    extractParamNames('/api/users/:id')
  })

  bench('extractParamNames - multiple params', () => {
    extractParamNames('/api/:companyId/users/:userId/notes/:noteId')
  })
})
