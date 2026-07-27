import { describe, expect, it, vi } from 'vitest'
import type { RouterContext } from 'stratal/router'
import { AccessShareMiddleware } from '../access-share.middleware'
import type { AccessService } from '../services/access.service'

/**
 * The middleware must be inert unless it has everything it needs: an
 * AccessService (access control configured) and Inertia installed
 * (`ctx.share` present). It is not restricted to GET — an Inertia render can
 * legally happen on any method. It must never touch the database — both
 * reads come from AuthContext.
 */
function makeAccessService(roles: string[], permissions: Record<string, string[]>): AccessService {
  return {
    getCurrentUserRoles: vi.fn(() => roles),
    getCurrentUserPermissions: vi.fn(() => permissions),
  } as unknown as AccessService
}

function makeCtx(method = 'GET', withInertia = true) {
  const shared: Record<string, unknown> = {}
  const ctx = {
    c: { req: { method } },
    ...(withInertia
      ? {
          share: (key: string, value: unknown) => { shared[key] = value },
          always: <T>(callback: () => T) => ({ callback }),
        }
      : {}),
  }
  return { ctx: ctx as unknown as RouterContext, shared }
}

function resolveShared(shared: Record<string, unknown>): unknown {
  const prop = shared.access as { callback: () => unknown } | undefined
  return prop?.callback()
}

describe('AccessShareMiddleware', () => {
  it('shares roles and permissions for an authenticated user', async () => {
    const access = makeAccessService(['editor'], { posts: ['create', 'read', 'update'] })
    const { ctx, shared } = makeCtx()
    const next = vi.fn(() => Promise.resolve())

    await new AccessShareMiddleware(access).handle(ctx, next)

    expect(resolveShared(shared)).toEqual({
      roles: ['editor'],
      permissions: { posts: ['create', 'read', 'update'] },
    })
    expect(next).toHaveBeenCalledOnce()
  })

  it('shares empty roles and permissions for a guest', async () => {
    const { ctx, shared } = makeCtx()

    await new AccessShareMiddleware(makeAccessService([], {})).handle(ctx, vi.fn(() => Promise.resolve()))

    expect(resolveShared(shared)).toEqual({ roles: [], permissions: {} })
  })

  it('wraps the payload so partial reloads keep it', async () => {
    const { ctx, shared } = makeCtx()

    await new AccessShareMiddleware(makeAccessService(['admin'], {})).handle(ctx, vi.fn(() => Promise.resolve()))

    expect(shared.access).toHaveProperty('callback')
    expect(typeof (shared.access as { callback: unknown }).callback).toBe('function')
  })

  it('evaluates lazily — nothing is read until the prop resolves', async () => {
    const access = makeAccessService(['admin'], {})
    const { ctx, shared } = makeCtx()

    await new AccessShareMiddleware(access).handle(ctx, vi.fn(() => Promise.resolve()))

    expect(access.getCurrentUserRoles).not.toHaveBeenCalled()
    resolveShared(shared)
    expect(access.getCurrentUserRoles).toHaveBeenCalledOnce()
  })

  it('no-ops when access control is not configured', async () => {
    const { ctx, shared } = makeCtx()
    const next = vi.fn(() => Promise.resolve())

    await new AccessShareMiddleware(undefined).handle(ctx, next)

    expect(shared.access).toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })

  it('no-ops when Inertia is not installed', async () => {
    const { ctx, shared } = makeCtx('GET', false)
    const next = vi.fn(() => Promise.resolve())

    await new AccessShareMiddleware(makeAccessService(['admin'], {})).handle(ctx, next)

    expect(shared.access).toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })

  it('shares the payload on a non-GET request, so a POST re-render still works', async () => {
    // e.g. `return ctx.inertia('Posts/Create', {...})` from a POST handler
    // re-rendering after a validation failure — every `<Can>` on that page
    // still needs `access`.
    const { ctx, shared } = makeCtx('POST')

    await new AccessShareMiddleware(makeAccessService(['admin'], {})).handle(ctx, vi.fn(() => Promise.resolve()))

    expect(resolveShared(shared)).toEqual({ roles: ['admin'], permissions: {} })
  })
})
