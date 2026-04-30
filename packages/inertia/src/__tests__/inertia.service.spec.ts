import type { Page } from '@inertiajs/core'
import type { Context } from 'hono'
import type { Application } from 'stratal'
import { DI_TOKENS } from 'stratal/di'
import { ROUTER_CONTEXT_KEYS, ROUTER_TOKENS, RouterContext, type RegisteredRoute, type RouteRegistry, type TrailingSlashMode } from 'stratal/router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InertiaModuleOptions } from '../inertia.options'
import { InertiaService } from '../services/inertia.service'
import type { SsrRendererService } from '../services/ssr-renderer.service'
import type { TemplateService } from '../services/template.service'

async function parsePageJson(response: Response): Promise<Page> {
  return response.json()
}

function createMockContext(overrides: {
  url?: string
  headers?: Record<string, string>
  isInertia?: boolean
  withoutSsr?: boolean
  routes?: RegisteredRoute[]
  trailingSlash?: TrailingSlashMode
} = {}): RouterContext {
  const headers = new Headers(overrides.headers ?? {})
  if (overrides.isInertia) {
    headers.set('x-inertia', 'true')
  }

  const mockRegistry = {
    named: () => overrides.routes ?? [],
  } as unknown as RouteRegistry

  const mockApplication = {
    config: { trailingSlash: overrides.trailingSlash },
  } as unknown as Application

  const mockContainer = {
    resolve: (token: symbol) => {
      if (token === ROUTER_TOKENS.RouteRegistry) return mockRegistry
      if (token === DI_TOKENS.Application) return mockApplication
      throw new Error(`Unexpected token: ${String(token)}`)
    },
  }

  const variables: Record<string, unknown> = {
    inertia: overrides.isInertia ?? false,
    withoutSsr: overrides.withoutSsr ?? false,
    inertiaFlash: {},
    inertiaFlashOut: {},
    [ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER]: mockContainer,
  }

  const c = {
    req: {
      url: overrides.url ?? 'http://localhost/',
      method: 'GET',
      header: (name: string) => headers.get(name) ?? undefined,
    },
    get: (key: string) => variables[key],
    set: (key: string, value: unknown) => { variables[key] = value },
    header: vi.fn(),
    status: vi.fn(),
    res: { status: 200 },
  } as unknown as Context

  return new RouterContext(c)
}

describe('InertiaService', () => {
  let service: InertiaService
  let mockTemplate: TemplateService
  let mockSsr: SsrRendererService

  const options: InertiaModuleOptions = {
    rootView: '<html>@inertia</html>',
    version: '1.0',
  }

  beforeEach(() => {
    mockTemplate = {
      render: vi.fn().mockReturnValue('<html><div id="app"></div></html>'),
    } as unknown as TemplateService

    mockSsr = {
      render: vi.fn().mockResolvedValue({ head: [], body: '' }),
    } as unknown as SsrRendererService

    service = new InertiaService(options, mockTemplate, mockSsr)
  })

  describe('render()', () => {
    it('should return JSON for Inertia requests', async () => {
      const ctx = createMockContext({ isInertia: true })

      const response = await service.render(ctx, 'Home', { message: 'Hello' })

      expect(response.status).toBe(200)
      expect(response.headers.get('X-Inertia')).toBe('true')
      expect(response.headers.get('Content-Type')).toBe('application/json')

      const body = await parsePageJson(response)
      expect(body.component).toBe('Home')
      expect(body.props).toEqual({ message: 'Hello', errors: {} })
      expect(body.version).toBe('1.0')
      expect(body.flash).toEqual({})
    })

    it('should return HTML for non-Inertia requests', async () => {
      const ctx = createMockContext()

      const response = await service.render(ctx, 'Home', { message: 'Hello' })

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
      expect(mockSsr.render).toHaveBeenCalled()
      expect(mockTemplate.render).toHaveBeenCalled()
    })

    it('should include render options in page object when true', async () => {
      const ctx = createMockContext({ isInertia: true })

      const response = await service.render(ctx, 'Home', {}, {
        encryptHistory: true,
        clearHistory: true,
      })

      const body = await parsePageJson(response)
      expect(body.encryptHistory).toBe(true)
      expect(body.clearHistory).toBe(true)
    })

    it('should omit encryptHistory and clearHistory when not set', async () => {
      const ctx = createMockContext({ isInertia: true })

      const response = await service.render(ctx, 'Home', {})

      const body = await parsePageJson(response)
      expect(body).not.toHaveProperty('encryptHistory')
      expect(body).not.toHaveProperty('clearHistory')
    })

    it('should handle partial reloads', async () => {
      const ctx = createMockContext({
        isInertia: true,
        headers: {
          'x-inertia-partial-component': 'Home',
          'x-inertia-partial-data': 'message',
        },
      })

      const response = await service.render(ctx, 'Home', {
        message: 'Hello',
        extra: 'data',
      })

      const body = await parsePageJson(response)
      expect(body.props).toEqual({ message: 'Hello', errors: {} })
      expect(body.props).not.toHaveProperty('extra')
    })

    it('should include parent prop when dot-notation partial data is requested', async () => {
      const ctx = createMockContext({
        isInertia: true,
        headers: {
          'x-inertia-partial-component': 'Home',
          'x-inertia-partial-data': 'user.permissions',
        },
      })

      const response = await service.render(ctx, 'Home', {
        user: { name: 'John', permissions: ['read'] },
        extra: 'data',
      })

      const body = await parsePageJson(response)
      expect(body.props).toEqual({ user: { name: 'John', permissions: ['read'] }, errors: {} })
      expect(body.props).not.toHaveProperty('extra')
    })

    it('should resolve optional props with dot-notation partial data', async () => {
      const ctx = createMockContext({
        isInertia: true,
        headers: {
          'x-inertia-partial-component': 'Home',
          'x-inertia-partial-data': 'user.settings',
        },
      })

      const response = await service.render(ctx, 'Home', {
        user: service.optional(() => ({ settings: { theme: 'dark' } })),
        name: 'John',
      })

      const body = await parsePageJson(response)
      expect(body.props).toEqual({ user: { settings: { theme: 'dark' } }, errors: {} })
    })

    it('should set version to null when not configured', async () => {
      const noVersionService = new InertiaService(
        { rootView: '<html>@inertia</html>' },
        mockTemplate,
        mockSsr,
      )
      const ctx = createMockContext({ isInertia: true })

      const response = await noVersionService.render(ctx, 'Home', {})
      const body = await parsePageJson(response)
      expect(body.version).toBeNull()
    })

    it('should include flash data from context', async () => {
      const ctx = createMockContext({ isInertia: true })
      // Simulate flash data set by middleware via context variable
      ctx.c.set('inertiaFlash', { success: 'Created!' })

      const response = await service.render(ctx, 'Home', {})
      const body = await parsePageJson(response)
      expect(body.flash).toEqual({ success: 'Created!' })
    })
  })

  describe('location()', () => {
    it('should return 409 with X-Inertia-Location header', () => {
      const response = service.location('https://example.com/dashboard')

      expect(response.status).toBe(409)
      expect(response.headers.get('X-Inertia-Location')).toBe('https://example.com/dashboard')
    })
  })

  describe('share()', () => {
    it('should include shared data in rendered props', async () => {
      const ctx = createMockContext({ isInertia: true })

      service.share('appName', 'MyApp')
      const response = await service.render(ctx, 'Home', { message: 'Hello' })

      const body = await parsePageJson(response)
      expect(body.props).toEqual({ appName: 'MyApp', message: 'Hello', errors: {} })
    })

    it('should track shared prop keys in sharedProps field', async () => {
      const ctx = createMockContext({ isInertia: true })

      service.share('appName', 'MyApp')
      const response = await service.render(ctx, 'Home', { message: 'Hello' })

      const body = await parsePageJson(response)
      expect(body.sharedProps).toContain('appName')
    })
  })

  describe('optional()', () => {
    it('should exclude optional props on initial load', async () => {
      const ctx = createMockContext({ isInertia: true })

      const response = await service.render(ctx, 'Home', {
        name: 'John',
        lazy: service.optional(() => 'lazy value'),
      })

      const body = await parsePageJson(response)
      expect(body.props).toEqual({ name: 'John', errors: {} })
    })
  })

  describe('defer()', () => {
    it('should add deferred props to deferredProps map', async () => {
      const ctx = createMockContext({ isInertia: true })

      const response = await service.render(ctx, 'Home', {
        name: 'John',
        comments: service.defer(() => ['comment1']),
      })

      const body = await parsePageJson(response)
      expect(body.deferredProps).toEqual({ default: ['comments'] })
      expect(body.props).not.toHaveProperty('comments')
    })

    it('should resolve deferred props on partial reload and exclude from deferredProps', async () => {
      const ctx = createMockContext({
        isInertia: true,
        headers: {
          'x-inertia-partial-component': 'Home',
          'x-inertia-partial-data': 'comments',
        },
      })

      const response = await service.render(ctx, 'Home', {
        name: 'John',
        comments: service.defer(() => ['comment1']),
      })

      const body = await parsePageJson(response)
      expect(body.props).toEqual({ comments: ['comment1'], errors: {} })
      expect(body).not.toHaveProperty('deferredProps')
    })
  })

  describe('merge()', () => {
    it('should add merge props to mergeProps array', async () => {
      const ctx = createMockContext({ isInertia: true })

      const response = await service.render(ctx, 'Home', {
        items: service.merge(() => [1, 2, 3]),
      })

      const body = await parsePageJson(response)
      expect(body.mergeProps).toEqual(['items'])
      expect(body.props).toEqual({ items: [1, 2, 3], errors: {} })
    })

    it('should exclude merge props from partial reloads when not requested', async () => {
      const ctx = createMockContext({
        isInertia: true,
        headers: {
          'x-inertia-partial-component': 'Home',
          'x-inertia-partial-data': 'stats',
        },
      })

      const response = await service.render(ctx, 'Home', {
        items: service.merge(() => [1, 2, 3]),
        stats: service.optional(() => ({ total: 5 })),
      })

      const body = await parsePageJson(response)
      expect(body.props).toEqual({ stats: { total: 5 }, errors: {} })
      expect(body).not.toHaveProperty('mergeProps')
    })

    it('should include merge props on partial reload when explicitly requested', async () => {
      const ctx = createMockContext({
        isInertia: true,
        headers: {
          'x-inertia-partial-component': 'Home',
          'x-inertia-partial-data': 'items',
        },
      })

      const response = await service.render(ctx, 'Home', {
        items: service.merge(() => [4, 5, 6]),
        name: 'John',
      })

      const body = await parsePageJson(response)
      expect(body.props).toEqual({ items: [4, 5, 6], errors: {} })
      expect(body.mergeProps).toEqual(['items'])
    })

    it('should support prepend strategy', async () => {
      const ctx = createMockContext({ isInertia: true })

      const response = await service.render(ctx, 'Home', {
        items: service.merge(() => [1, 2], { strategy: 'prepend' }),
      })

      const body = await parsePageJson(response)
      expect(body.prependProps).toEqual(['items'])
    })

    it('should support deep merge strategy', async () => {
      const ctx = createMockContext({ isInertia: true })

      const response = await service.render(ctx, 'Home', {
        data: service.merge(() => ({ nested: true }), { strategy: 'deep' }),
      })

      const body = await parsePageJson(response)
      expect(body.deepMergeProps).toEqual(['data'])
    })
  })

  describe('once()', () => {
    it('should resolve once props on initial load and track in onceProps', async () => {
      const ctx = createMockContext({ isInertia: true })

      const response = await service.render(ctx, 'Home', {
        categories: service.once(() => ['a', 'b']),
      })

      const body = await parsePageJson(response)
      expect(body.props).toHaveProperty('categories', ['a', 'b'])
      expect(body.onceProps).toEqual({ categories: { prop: 'categories' } })
    })

    it('should resolve once props on partial reload when requested', async () => {
      const ctx = createMockContext({
        isInertia: true,
        headers: {
          'x-inertia-partial-component': 'Home',
          'x-inertia-partial-data': 'categories',
        },
      })

      const response = await service.render(ctx, 'Home', {
        categories: service.once(() => ['a', 'b']),
        name: 'John',
      })

      const body = await parsePageJson(response)
      expect(body.props).toHaveProperty('categories', ['a', 'b'])
    })
  })

  describe('always()', () => {
    it('should always include always props even on partial reloads', async () => {
      const ctx = createMockContext({
        isInertia: true,
        headers: {
          'x-inertia-partial-component': 'Home',
          'x-inertia-partial-data': 'name',
        },
      })

      const response = await service.render(ctx, 'Home', {
        name: 'John',
        timestamp: service.always(() => 12345),
      })

      const body = await parsePageJson(response)
      expect(body.props).toHaveProperty('timestamp', 12345)
      expect(body.props).toHaveProperty('name', 'John')
    })
  })

  describe('per-route SSR control', () => {
    it('should skip SSR when withoutSsr context flag is set', async () => {
      const ctx = createMockContext({ withoutSsr: true })

      await service.render(ctx, 'Home', { message: 'Hello' })

      expect(mockSsr.render).not.toHaveBeenCalled()
      expect(mockTemplate.render).toHaveBeenCalled()
    })

    it('should skip SSR when URL matches ssr.disabled pattern', async () => {
      const ssrOptions: InertiaModuleOptions = {
        rootView: '<html>@inertia</html>',
        version: '1.0',
        ssr: {
          bundle: vi.fn() as unknown as InertiaModuleOptions['ssr'] extends { bundle: infer B } ? B : never,
          disabled: ['admin/*'],
        },
      }

      const ssrService = new InertiaService(ssrOptions, mockTemplate, mockSsr)
      const ctx = createMockContext({ url: 'http://localhost/admin/dashboard' })

      await ssrService.render(ctx, 'AdminDashboard', {})

      expect(mockSsr.render).not.toHaveBeenCalled()
      expect(mockTemplate.render).toHaveBeenCalled()
    })

    it('should perform SSR for non-matching URL patterns', async () => {
      const ssrOptions: InertiaModuleOptions = {
        rootView: '<html>@inertia</html>',
        version: '1.0',
        ssr: {
          bundle: vi.fn() as unknown as InertiaModuleOptions['ssr'] extends { bundle: infer B } ? B : never,
          disabled: ['admin/*'],
        },
      }

      const ssrService = new InertiaService(ssrOptions, mockTemplate, mockSsr)
      const ctx = createMockContext({ url: 'http://localhost/home' })

      await ssrService.render(ctx, 'Home', {})

      expect(mockSsr.render).toHaveBeenCalled()
    })
  })

  describe('routes shared prop', () => {
    const sampleRoute: RegisteredRoute = {
      method: 'get',
      path: '/users',
      paramNames: [],
      domainParamNames: [],
      controller: 'UsersController',
      action: 'index',
      hidden: false,
      middleware: [],
      name: 'users.index',
    }

    it('does not inject routes when options.routes is unset', async () => {
      const ctx = createMockContext({ isInertia: true })
      const response = await service.render(ctx, 'Home', {})
      const body = await parsePageJson(response)
      expect(body.props).not.toHaveProperty('routes')
      expect(body.props).not.toHaveProperty('trailingSlash')
    })

    it('injects routes and defaults trailingSlash to "ignore" when not configured', async () => {
      const routesOptions: InertiaModuleOptions = {
        rootView: '<html>@inertia</html>',
        version: '1.0',
        routes: true,
      }
      const routesService = new InertiaService(routesOptions, mockTemplate, mockSsr)
      const ctx = createMockContext({ isInertia: true, routes: [sampleRoute] })

      const response = await routesService.render(ctx, 'Home', {})
      const body = await parsePageJson(response)

      expect(body.props.routes).toEqual({
        'users.index': { path: '/users', paramNames: [], domainParamNames: [] },
      })
      expect(body.props.trailingSlash).toBe('ignore')
    })

    it('forwards configured trailingSlash mode to shared props', async () => {
      const routesOptions: InertiaModuleOptions = {
        rootView: '<html>@inertia</html>',
        version: '1.0',
        routes: true,
      }
      const routesService = new InertiaService(routesOptions, mockTemplate, mockSsr)
      const ctx = createMockContext({
        isInertia: true,
        routes: [sampleRoute],
        trailingSlash: 'always',
      })

      const response = await routesService.render(ctx, 'Home', {})
      const body = await parsePageJson(response)

      expect(body.props.trailingSlash).toBe('always')
    })
  })
})
