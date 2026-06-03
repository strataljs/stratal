import type { Context } from 'hono'
import { RouterContext } from 'stratal/router'
import { describe, expect, it, vi } from 'vitest'
import { augmentRouterContext } from '../augment/router-context'
import type { InertiaService } from '../services/inertia.service'

function createMockHonoContext() {
  const store = new Map<string, unknown>()
  return {
    req: { url: 'http://localhost/', method: 'GET', header: () => undefined },
    get: vi.fn((key: string) => store.get(key)),
    set: vi.fn((key: string, value: unknown) => { store.set(key, value) }),
    header: vi.fn(),
    status: vi.fn(),
    res: { status: 200 },
  }
}

describe('ctx.share macro', () => {
  it('delegates to InertiaService.share on the request container', () => {
    const service = { share: vi.fn() } as unknown as InertiaService
    augmentRouterContext(() => service)

    const ctx = new RouterContext(createMockHonoContext() as unknown as Context)
    ctx.share('featureFlags', { 'new-checkout': true })

    expect(service.share).toHaveBeenCalledWith('featureFlags', { 'new-checkout': true })
  })
})
