import { OpenAPIHono } from '@hono/zod-openapi'
import { injectable } from 'tsyringe'
import { bench, describe } from 'vitest'
import { z } from '../../i18n/validation'
import type { LoggerService } from '../../logger'
import type { ModuleRegistry } from '../../module/module-registry'
import type { Constructor } from '../../types'
import type { IController } from '../controller'
import { Controller } from '../decorators/controller.decorator'
import type { HonoApp } from '../hono-app'
import { RouteRegistry } from '../route-registry'
import { Route } from '../decorators/route.decorator'
import type { RouterContext } from '../router-context'
import { RouteRegistrationService } from '../services/route-registration.service'
import type { VersioningService } from '../services/versioning.service'
import type { LocalePathService } from '../services/locale-path.service'
import type { RouterEnv } from '../types'

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

const createMockModuleRegistry = (controllers: Constructor<IController>[]): ModuleRegistry => ({
  getAllControllers: () => controllers,
} as unknown as ModuleRegistry)

describe('RouteRegistration - Configure', () => {
  bench('register controller with 5 OpenAPI routes', async () => {
    const app = new OpenAPIHono<RouterEnv>() as unknown as HonoApp
    const controllers = [ItemsController as unknown as Constructor<IController>]
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
    const controllers = [SimpleController as unknown as Constructor<IController>]
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
      ItemsController as unknown as Constructor<IController>,
      SimpleController as unknown as Constructor<IController>,
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
