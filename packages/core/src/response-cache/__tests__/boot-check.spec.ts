import { describe, expect, it } from 'vitest'
import { ResponseCacheConfigError } from '../errors'
import { assertCachingAvailable, assertNoGatewayOptions, assertValidGatewayEntrypoint } from '../boot-check'
import { ResponseCacheModule } from '../response-cache.module'

describe('assertCachingAvailable', () => {
  it('passes when no cacheable routes are registered', () => {
    expect(() => assertCachingAvailable(0, undefined)).not.toThrow()
  })

  it('passes when cacheable routes exist and ctx.cache is present', () => {
    expect(() => assertCachingAvailable(3, { purge: async () => { /* Mock cache */ } })).not.toThrow()
  })

  it('throws when cacheable routes exist but ctx.cache is absent', () => {
    expect(() => assertCachingAvailable(3, undefined)).toThrow(ResponseCacheConfigError)
  })

  it('names the required wrangler settings in the error', () => {
    expect(() => assertCachingAvailable(1, undefined)).toThrow(/cache.*enabled/i)
  })
})

describe('assertValidGatewayEntrypoint', () => {
  it('accepts an ordinary export name', () => {
    expect(() => assertValidGatewayEntrypoint({ gateway: { entrypoint: 'Cached' } })).not.toThrow()
  })

  it('no-ops when no gateway is configured', () => {
    expect(() => assertValidGatewayEntrypoint({})).not.toThrow()
  })

  it('rejects "default" — the gateway forwarding to itself', () => {
    // `ctx.exports.default` re-enters `Stratal.fetch`, which marks the new
    // context as the gateway and dispatches again, recursing to the
    // subrequest limit.
    expect(() => assertValidGatewayEntrypoint({ gateway: { entrypoint: 'default' } })).toThrow(
      ResponseCacheConfigError,
    )
    expect(() => assertValidGatewayEntrypoint({ gateway: { entrypoint: 'default' } })).toThrow(
      /cannot be "default".*recursing/s,
    )
  })

  it('rejects an empty or whitespace-only entrypoint', () => {
    expect(() => assertValidGatewayEntrypoint({ gateway: { entrypoint: '' } })).toThrow(
      /non-empty export name/,
    )
    expect(() => assertValidGatewayEntrypoint({ gateway: { entrypoint: '   ' } })).toThrow(
      /non-empty export name/,
    )
  })

  it('is enforced through ResponseCacheModule.forRoot', () => {
    expect(() => ResponseCacheModule.forRoot({ gateway: { entrypoint: 'default' } })).toThrow(
      ResponseCacheConfigError,
    )
  })
})

describe('assertNoGatewayOptions', () => {
  it('rejects an empty entrypoint rather than reading it as "no gateway"', () => {
    // Must not silently fall through to the partitions/primers rejection,
    // which would report the wrong problem.
    expect(() => assertNoGatewayOptions({ gateway: { entrypoint: '' } })).toThrow(
      /non-empty export name/,
    )
  })

  it('passes for options that declare neither gateway option', () => {
    expect(() => assertNoGatewayOptions({ defaults: { ttl: 300 } })).not.toThrow()
  })

  it('passes for empty `partitions`/`primers` containers', () => {
    expect(() => assertNoGatewayOptions({ partitions: {}, primers: [] })).not.toThrow()
  })

  it('passes `partitions`/`primers` through once a gateway entrypoint is configured', () => {
    class Primer {
      async handle(): Promise<void> { /* noop */ }
    }

    expect(() => assertNoGatewayOptions({
      gateway: { entrypoint: 'Cached' },
      partitions: { user: () => 'u1' },
      primers: [Primer],
    })).not.toThrow()
  })

  it('throws on a non-empty `partitions` with no gateway configured', () => {
    expect(() => assertNoGatewayOptions({ partitions: { user: () => 'u1' } })).toThrow(
      ResponseCacheConfigError,
    )
    expect(() => assertNoGatewayOptions({ partitions: { user: () => 'u1' } })).toThrow(
      /`partitions` requires `gateway: \{ entrypoint \}`/,
    )
  })

  it('throws on a non-empty `primers` with no gateway configured', () => {
    class Primer {
      async handle(): Promise<void> { /* noop */ }
    }

    expect(() => assertNoGatewayOptions({ primers: [Primer] })).toThrow(ResponseCacheConfigError)
    expect(() => assertNoGatewayOptions({ primers: [Primer] })).toThrow(
      /`primers` requires `gateway: \{ entrypoint \}`/,
    )
  })
})
