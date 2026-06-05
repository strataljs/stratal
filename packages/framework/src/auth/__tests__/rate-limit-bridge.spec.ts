import { Container } from 'stratal/di'
import type { IRateLimiterStore } from 'stratal/rate-limiter'
import { Limit, RATE_LIMITER_TOKENS, RateLimiterRegistry } from 'stratal/rate-limiter'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createBetterAuthRateLimitStorage,
  projectCustomRules,
} from '../rate-limit-bridge'

class FakeStore implements IRateLimiterStore {
  private readonly entries = new Map<string, unknown>()

  get<T>(key: string): Promise<T | null> {
    return Promise.resolve((this.entries.get(key) as T | undefined) ?? null)
  }
  set<T>(key: string, value: T, _ttlSeconds: number): Promise<void> {
    this.entries.set(key, value)
    return Promise.resolve()
  }
  delete(key: string): Promise<void> {
    this.entries.delete(key)
    return Promise.resolve()
  }
  raw(): Map<string, unknown> {
    return this.entries
  }
}

function buildRegistry(): RateLimiterRegistry {
  // The registry resolves its store lazily from the container per access.
  const container = new Container()
  container.registerValue(RATE_LIMITER_TOKENS.Store, new FakeStore())
  return new RateLimiterRegistry(container)
}

describe('rate-limit-bridge', () => {
  describe('forPath / pathEntries macros', () => {
    it('augments RateLimiterRegistry with forPath() at runtime', () => {
      const r = buildRegistry()
      expect(typeof r.forPath).toBe('function')
      expect(typeof r.pathEntries).toBe('function')
    })

    it('stores path-keyed resolvers separately from name-keyed for()', () => {
      const r = buildRegistry()
      const nameResolver = vi.fn(() => Limit.perMinute(60))
      const pathResolver = vi.fn(() => Limit.perSeconds(10, 3))

      r.for('api', nameResolver)
      r.forPath('/sign-in/email', pathResolver)

      expect(r.has('api')).toBe(true)
      expect(r.has('/sign-in/email')).toBe(false)
      expect([...r.pathEntries()]).toEqual([['/sign-in/email', pathResolver]])
    })

    it('keeps separate path maps per registry instance', () => {
      const a = buildRegistry()
      const b = buildRegistry()

      a.forPath('/a', () => Limit.perSeconds(10, 1))
      b.forPath('/b', () => Limit.perSeconds(10, 2))

      expect([...a.pathEntries()].map(([p]) => p)).toEqual(['/a'])
      expect([...b.pathEntries()].map(([p]) => p)).toEqual(['/b'])
    })

    it('overwrites a path on re-registration', () => {
      const r = buildRegistry()
      const first = vi.fn(() => Limit.perSeconds(10, 1))
      const second = vi.fn(() => Limit.perSeconds(10, 5))
      r.forPath('/p', first)
      r.forPath('/p', second)

      const entries = [...r.pathEntries()]
      expect(entries).toHaveLength(1)
      expect(entries[0]?.[1]).toBe(second)
    })
  })

  describe('createBetterAuthRateLimitStorage', () => {
    it('round-trips a RateLimit value under the namespaced key', async () => {
      const store = new FakeStore()
      const adapter = createBetterAuthRateLimitStorage(store)

      const value = { key: 'k', count: 3, lastRequest: Date.now() }
      await adapter.set('k', value)
      const got = await adapter.get('k')

      expect(got).toEqual(value)
      expect(store.raw().has('ba-rl:k')).toBe(true)
      expect(store.raw().has('k')).toBe(false)
    })

    it('returns null for a missing key', async () => {
      const adapter = createBetterAuthRateLimitStorage(new FakeStore())
      expect(await adapter.get('missing')).toBeNull()
    })

    it('namespace prefix prevents collision with Stratal counters', async () => {
      const store = new FakeStore()
      const adapter = createBetterAuthRateLimitStorage(store)

      // Stratal-side write under its own namespace
      await store.set('rl:api:60:alice', { count: 1, resetAt: 0 }, 60)
      // Better-auth-side write under same logical key
      await adapter.set('rl:api:60:alice', { key: 'rl:api:60:alice', count: 1, lastRequest: 0 })

      // Both coexist
      expect(await store.get('rl:api:60:alice')).not.toBeNull()
      expect(await store.get('ba-rl:rl:api:60:alice')).not.toBeNull()
    })
  })

  describe('projectCustomRules', () => {
    afterEach(() => {
      // No-op — the registry instances we construct go out of scope and the
      // WeakMap collects naturally. Listed to keep test isolation discipline.
    })

    it('returns an empty record when no path entries are registered', () => {
      const r = buildRegistry()
      r.for('api', () => Limit.perMinute(60))
      expect(projectCustomRules(r)).toEqual({})
    })

    it('projects a single Limit to { window, max }', async () => {
      const r = buildRegistry()
      r.forPath('/sign-in/email', () => Limit.perSeconds(10, 3))
      const rules = projectCustomRules(r)

      const handler = rules['/sign-in/email']
      expect(typeof handler).toBe('function')
      const out = await (handler as (req: Request) => Promise<unknown>)(new Request('http://x/sign-in/email'))
      expect(out).toEqual({ window: 10, max: 3 })
    })

    it('projects Limit.none() to false (better-auth disable sentinel)', async () => {
      const r = buildRegistry()
      r.forPath('/forget-password', () => Limit.none())
      const rules = projectCustomRules(r)
      const out = await (rules['/forget-password'] as (req: Request) => Promise<unknown>)(
        new Request('http://x/forget-password'),
      )
      expect(out).toBe(false)
    })

    it('reduces multi-Limit returns to the most restrictive (smallest max/windowSeconds)', async () => {
      const r = buildRegistry()
      r.forPath('/p', () => [
        Limit.perSeconds(10, 50),  // 5/s
        Limit.perSeconds(60, 6),   // 0.1/s — most restrictive
        Limit.perSeconds(1, 2),    // 2/s
      ])
      const rules = projectCustomRules(r)
      const out = await (rules['/p'] as (req: Request) => Promise<unknown>)(new Request('http://x/p'))
      expect(out).toEqual({ window: 60, max: 6 })
    })

    it('passes the native Request to async resolvers', async () => {
      const r = buildRegistry()
      const resolver = vi.fn((req: Request) => {
        return req.headers.get('x-tier') === 'pro'
          ? Limit.perSeconds(10, 10)
          : Limit.perSeconds(10, 3)
      })
      r.forPath('/two-factor/*', resolver)
      const rules = projectCustomRules(r)
      const handler = rules['/two-factor/*'] as (req: Request) => Promise<unknown>

      const free = await handler(new Request('http://x/two-factor/totp'))
      const pro = await handler(new Request('http://x/two-factor/totp', { headers: { 'x-tier': 'pro' } }))

      expect(free).toEqual({ window: 10, max: 3 })
      expect(pro).toEqual({ window: 10, max: 10 })
      expect(resolver).toHaveBeenCalledTimes(2)
    })

    it('treats an array of all-disabled Limits as bypass (false)', async () => {
      const r = buildRegistry()
      r.forPath('/p', () => [Limit.none(), Limit.none()])
      const rules = projectCustomRules(r)
      const out = await (rules['/p'] as (req: Request) => Promise<unknown>)(new Request('http://x/p'))
      expect(out).toBe(false)
    })
  })
})
