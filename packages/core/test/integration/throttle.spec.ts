import { Test, type TestingModule } from '@stratal/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { RateLimiterNotConfiguredError } from '../../src/rate-limiter/errors'
import { _resetThrottleMiddlewareCache } from '../../src/rate-limiter/throttle.middleware'
import {
  ThrottleDecoratorAppModule,
  ThrottleNoModuleAppModule,
  ThrottleScopeAppModule,
  ThrottleUnconfiguredAppModule,
} from '../fixtures/throttle.controller'

/**
 * End-to-end tests for the rate limiter — exercises both attachment paths
 * (`router.throttle()` and `@RateLimit`), the success-path header tagging,
 * the 429 path, and the two configuration-error surfaces.
 */
describe('Rate limiter (integration)', () => {
  let module: TestingModule | null = null

  afterEach(async () => {
    await module?.close()
    module = null
    // Throttle middleware classes cache by name across tests; reset so each
    // test gets a fresh class (per-test Application means a fresh registry).
    _resetThrottleMiddlewareCache()
  })

  it('router.throttle() emits X-RateLimit-* headers and 429s once exhausted', async () => {
    module = await Test.createTestingModule({
      imports: [ThrottleScopeAppModule],
    }).compile()

    const r1 = await module.http.get('/throttled').send()
    r1.assertOk()
    expect(r1.headers.get('x-ratelimit-limit')).toBe('2')
    expect(r1.headers.get('x-ratelimit-remaining')).toBe('1')

    const r2 = await module.http.get('/throttled').send()
    r2.assertOk()
    expect(r2.headers.get('x-ratelimit-remaining')).toBe('0')

    const r3 = await module.http.get('/throttled').send()
    r3.assertStatus(429)
    expect(r3.headers.get('retry-after')).toBeTruthy()
    expect(r3.headers.get('x-ratelimit-limit')).toBe('2')
    expect(r3.headers.get('x-ratelimit-remaining')).toBe('0')
  })

  it('@RateLimit decorator enforces the same limits via the middleware chain', async () => {
    module = await Test.createTestingModule({
      imports: [ThrottleDecoratorAppModule],
    }).compile()

    const r1 = await module.http.get('/decorated').send()
    r1.assertOk()
    expect(r1.headers.get('x-ratelimit-limit')).toBe('2')

    await module.http.get('/decorated').send()

    const r3 = await module.http.get('/decorated').send()
    r3.assertStatus(429)
    expect(r3.headers.get('x-ratelimit-limit')).toBe('2')
  })

  it('importing RateLimiterModule without forRoot fails fast at boot', async () => {
    await expect(
      Test.createTestingModule({ imports: [ThrottleUnconfiguredAppModule] }).compile(),
    ).rejects.toBeInstanceOf(RateLimiterNotConfiguredError)
  })

  it('using router.throttle without importing RateLimiterModule surfaces a clear error at request time', async () => {
    module = await Test.createTestingModule({
      imports: [ThrottleNoModuleAppModule],
    }).compile()

    const response = await module.http.get('/throttled').send()
    response.assertStatus(500)
    const body = await response.json() as { message: string }
    // Exception handler renders the i18n key when no I18nService is registered;
    // either way the message must point at RateLimiterModule so the dev knows
    // what to fix.
    expect(body.message).toMatch(/RateLimiterModule|rateLimit\.moduleNotImported/)
  })
})
