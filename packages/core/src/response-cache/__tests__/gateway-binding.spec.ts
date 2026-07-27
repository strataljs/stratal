import { describe, expect, it, vi } from 'vitest'
import { ResponseCacheConfigError } from '../errors'
import { createLoopbackPurgeTarget, resolveCachedEntrypoint } from '../gateway-binding'

const stub = { fetch: vi.fn(), purge: vi.fn() }

describe('resolveCachedEntrypoint', () => {
  it('returns the binding published under the configured name', () => {
    expect(resolveCachedEntrypoint({ exports: { Cached: stub } }, 'Cached')).toBe(stub)
  })

  it('throws when ctx.exports carries no export under that name', () => {
    expect(() => resolveCachedEntrypoint({ exports: { Cached: stub } }, 'Cachd')).toThrow(
      ResponseCacheConfigError,
    )
  })

  it('names the missing export and lists what is actually reachable', () => {
    expect(() => resolveCachedEntrypoint({ exports: { Cached: stub } }, 'Cachd')).toThrow(
      /"Cachd" is not exported.*Exports visible on `ctx\.exports`: Cached/s,
    )
  })

  it('reports "(none)" when the Worker exports nothing at all', () => {
    expect(() => resolveCachedEntrypoint({ exports: {} }, 'Cached')).toThrow(/\(none\)/)
  })

  it('throws when ctx.exports is absent, pointing at the compatibility flag', () => {
    expect(() => resolveCachedEntrypoint({}, 'Cached')).toThrow(/enable_ctx_exports/)
  })

  it('throws when reading ctx.exports itself throws', () => {
    // What a Worker without the `enable_ctx_exports` compatibility flag does.
    const ctx = {
      get exports(): unknown {
        throw new Error('ctx.exports requires the enable_ctx_exports flag')
      },
    }

    expect(() => resolveCachedEntrypoint(ctx, 'Cached')).toThrow(ResponseCacheConfigError)
    expect(() => resolveCachedEntrypoint(ctx, 'Cached')).toThrow(/enable_ctx_exports/)
  })

  it('throws rather than returning undefined for a null execution context', () => {
    expect(() => resolveCachedEntrypoint(null, 'Cached')).toThrow(ResponseCacheConfigError)
  })
})

describe('createLoopbackPurgeTarget', () => {
  it('forwards the purge spec to the cached entrypoint over RPC', async () => {
    const purge = vi.fn().mockResolvedValue({ success: true })
    const target = createLoopbackPurgeTarget({ exports: { Cached: { purge } } }, 'Cached')

    await target.purge({ tags: ['post:1'] })

    expect(purge).toHaveBeenCalledWith({ tags: ['post:1'] })
  })

  it('surfaces the config error when the entrypoint is unreachable at purge time', async () => {
    const target = createLoopbackPurgeTarget({ exports: {} }, 'Cached')

    await expect(target.purge({ tags: ['post:1'] })).rejects.toThrow(ResponseCacheConfigError)
  })
})
