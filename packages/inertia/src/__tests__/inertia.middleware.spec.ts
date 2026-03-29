import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from 'hono'
import { RouterContext } from 'stratal/router'
import type { InertiaModuleOptions } from '../inertia.options'
import { InertiaMiddleware } from '../middleware/inertia.middleware'

function createMockContext(overrides: {
  url?: string
  method?: string
  headers?: Record<string, string>
  resStatus?: number
} = {}): { ctx: RouterContext; c: Record<string, unknown> } {
  const headers = new Headers(overrides.headers ?? {})

  const c = {
    req: {
      url: overrides.url ?? 'http://localhost/',
      method: overrides.method ?? 'GET',
      header: (name: string) => headers.get(name) ?? undefined,
    },
    get: vi.fn(),
    set: vi.fn(),
    header: vi.fn(),
    status: vi.fn(),
    res: { status: overrides.resStatus ?? 200 },
  }

  return { ctx: new RouterContext(c as unknown as Context), c }
}

describe('InertiaMiddleware', () => {
  let middleware: InertiaMiddleware
  const options: InertiaModuleOptions = {
    rootView: '<html></html>',
    version: '1.0',
  }

  beforeEach(() => {
    middleware = new InertiaMiddleware(options)
  })

  it('should set inertia context variables', async () => {
    const { ctx, c } = createMockContext({
      headers: { 'x-inertia': 'true', 'purpose': 'prefetch' },
    })

    await middleware.handle(ctx, vi.fn())

    expect(c.set).toHaveBeenCalledWith('inertia', true)
    expect(c.set).toHaveBeenCalledWith('inertiaPrefetch', true)
    expect(c.set).toHaveBeenCalledWith('withoutSsr', false)
  })

  it('should set inertia to false for non-Inertia requests', async () => {
    const { ctx, c } = createMockContext()

    await middleware.handle(ctx, vi.fn())

    expect(c.set).toHaveBeenCalledWith('inertia', false)
    expect(c.set).toHaveBeenCalledWith('inertiaPrefetch', false)
  })

  it('should add Vary header to all responses', async () => {
    const { ctx, c } = createMockContext()

    await middleware.handle(ctx, vi.fn())

    expect(c.header).toHaveBeenCalledWith('Vary', 'X-Inertia')
  })

  it('should return 409 on version mismatch for GET requests', async () => {
    const { ctx, c } = createMockContext({
      headers: { 'x-inertia': 'true', 'x-inertia-version': 'old-version' },
    })

    const next = vi.fn()
    await middleware.handle(ctx, next)

    expect(c.status).toHaveBeenCalledWith(409)
    expect(c.header).toHaveBeenCalledWith('X-Inertia-Location', 'http://localhost/')
    expect(next).not.toHaveBeenCalled()
  })

  it('should not check version for non-GET requests', async () => {
    const { ctx, c } = createMockContext({
      method: 'POST',
      headers: { 'x-inertia': 'true', 'x-inertia-version': 'old-version' },
    })

    const next = vi.fn()
    await middleware.handle(ctx, next)

    expect(next).toHaveBeenCalled()
    expect(c.status).not.toHaveBeenCalledWith(409)
  })

  it('should convert 302 to 303 for non-GET Inertia requests', async () => {
    const { ctx, c } = createMockContext({
      method: 'PUT',
      headers: { 'x-inertia': 'true' },
      resStatus: 302,
    })

    await middleware.handle(ctx, vi.fn())

    expect(c.status).toHaveBeenCalledWith(303)
  })

  it('should not convert 302 for GET requests', async () => {
    const { ctx, c } = createMockContext({
      method: 'GET',
      headers: { 'x-inertia': 'true' },
      resStatus: 302,
    })

    await middleware.handle(ctx, vi.fn())

    expect(c.status).not.toHaveBeenCalledWith(303)
  })

})
