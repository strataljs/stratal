import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from 'hono'
import { RouterContext } from 'stratal/router'
import type { InertiaModuleOptions } from '../inertia.options'
import type { InertiaPage } from '../types'
import { InertiaService } from '../services/inertia.service'
import type { SsrRendererService } from '../services/ssr-renderer.service'
import type { TemplateService } from '../services/template.service'

async function parsePageJson(response: Response): Promise<InertiaPage> {
  const data: InertiaPage = await response.json()
  return data
}

function createMockContext(overrides: {
  url?: string
  headers?: Record<string, string>
  isInertia?: boolean
  withoutSsr?: boolean
} = {}): RouterContext {
  const headers = new Headers(overrides.headers ?? {})
  if (overrides.isInertia) {
    headers.set('x-inertia', 'true')
  }

  const variables: Record<string, unknown> = {
    inertia: overrides.isInertia ?? false,
    withoutSsr: overrides.withoutSsr ?? false,
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
      expect(body.props).toEqual({ message: 'Hello' })
      expect(body.version).toBe('1.0')
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
      expect(body.props).toEqual({ message: 'Hello' })
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
      expect(body.props).toEqual({ user: { name: 'John', permissions: ['read'] } })
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
      expect(body.props).toEqual({ user: { settings: { theme: 'dark' } } })
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
      expect(body.props).toEqual({ appName: 'MyApp', message: 'Hello' })
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
      expect(body.props).toEqual({ name: 'John' })
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
      expect(body.props).toEqual({ comments: ['comment1'] })
      expect(body.deferredProps).toEqual({})
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
      expect(body.props).toEqual({ items: [1, 2, 3] })
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
      expect(body.props).toEqual({ stats: { total: 5 } })
      expect(body.mergeProps).toEqual([])
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
      expect(body.props).toEqual({ items: [4, 5, 6] })
      expect(body.mergeProps).toEqual(['items'])
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
})
