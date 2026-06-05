import { describe, expect, it, vi } from 'vitest'
import { FeatureFlagShareMiddleware } from '../feature-flag-share.middleware'
import type { FeatureFlagService } from '../services/feature-flag.service'

function makeCtx(method: string, withShare: boolean) {
  return {
    c: { req: { method } },
    share: withShare ? vi.fn() : undefined,
  }
}

function makeMiddleware(map: Record<string, unknown> = { 'new-checkout': true }) {
  const flags = { all: vi.fn(() => Promise.resolve(map)) } as unknown as FeatureFlagService
  return { middleware: new FeatureFlagShareMiddleware(flags), flags }
}

describe('FeatureFlagShareMiddleware', () => {
  it('shares evaluated flags on GET when Inertia provides ctx.share', async () => {
    const { middleware } = makeMiddleware({ 'new-checkout': true })
    const ctx = makeCtx('GET', true)
    const next = vi.fn(() => Promise.resolve())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal ctx double
    await middleware.handle(ctx as any, next)

    expect(ctx.share).toHaveBeenCalledWith('featureFlags', { 'new-checkout': true })
    expect(next).toHaveBeenCalled()
  })

  it('does not share on non-GET requests', async () => {
    const { middleware } = makeMiddleware()
    const ctx = makeCtx('POST', true)
    const next = vi.fn(() => Promise.resolve())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal ctx double
    await middleware.handle(ctx as any, next)

    expect(ctx.share).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  it('no-ops when ctx.share is absent (Inertia not installed)', async () => {
    const { middleware, flags } = makeMiddleware()
    const ctx = makeCtx('GET', false)
    const next = vi.fn(() => Promise.resolve())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal ctx double
    await middleware.handle(ctx as any, next)

    expect(flags.all).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })
})
