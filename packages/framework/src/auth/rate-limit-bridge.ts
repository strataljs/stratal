/**
 * Rate-limit bridge between Stratal's `RateLimiterModule` and better-auth.
 *
 * Importing this file (transitively, via `auth.module.ts`) does two things:
 *
 *  1. Augments `RateLimiterRegistry` with `forPath()` + `pathEntries()` via
 *     Stratal's `Macroable`. Path-keyed rules registered on the same registry
 *     used for Stratal's own throttling are projected into better-auth's
 *     `customRules` by {@link projectCustomRules}.
 *  2. Exports {@link createBetterAuthRateLimitStorage} — adapts Stratal's
 *     {@link IRateLimiterStore} into better-auth's `customStorage`, so both
 *     systems share one backing store.
 *
 * `AuthModule.forRootAsync` wires both automatically when `RateLimiterModule`
 * is imported. Users with explicit `rateLimit.customStorage` /
 * `rateLimit.customRules` keys in their auth factory keep precedence.
 *
 * Frictions, documented for path-keyed entries:
 *
 *  - `Limit.by(...)` is meaningless. Better-auth scopes per-IP+path.
 *  - Multiple `Limit`s reduce to the most restrictive (smallest max-per-second).
 *  - `Limit.none()` projects to `false` (better-auth's "disable" sentinel).
 *  - `Limit.response(...)` is a no-op. Better-auth renders its own 429.
 *  - Snapshot caveat: `customRules` is built once at AuthService construction,
 *    so register all `forPath()` entries inside `OnInitialize` hooks.
 */
import { type IRateLimiterStore, type Limit, RateLimiterRegistry } from 'stratal/rate-limiter'

/**
 * Resolver attached to a path-keyed limiter entry. Receives the native
 * `Request` (better-auth's customRules invokes us with the live Request)
 * and returns one or more `Limit`s. Async is supported.
 */
export type PathLimitResolver = (
  req: Request,
) => Limit | Limit[] | Promise<Limit | Limit[]>

interface BetterAuthRateLimit {
  key: string
  count: number
  lastRequest: number
}

interface BetterAuthRateLimitRule {
  window: number
  max: number
}

type BetterAuthCustomRule =
  | BetterAuthRateLimitRule
  | false
  | ((req: Request) => Promise<BetterAuthRateLimitRule | false>)

// Per-instance path map — keyed by registry so we don't pin GC roots.
const pathResolvers = new WeakMap<RateLimiterRegistry, Map<string, PathLimitResolver>>()

function getOrCreatePathMap(registry: RateLimiterRegistry): Map<string, PathLimitResolver> {
  let map = pathResolvers.get(registry)
  if (!map) {
    map = new Map()
    pathResolvers.set(registry, map)
  }
  return map
}

RateLimiterRegistry.macro('forPath', function (
  this: RateLimiterRegistry,
  path: string,
  resolver: PathLimitResolver,
): void {
  getOrCreatePathMap(this).set(path, resolver)
})

RateLimiterRegistry.macro('pathEntries', function (
  this: RateLimiterRegistry,
): IterableIterator<[string, PathLimitResolver]> {
  return (pathResolvers.get(this) ?? new Map<string, PathLimitResolver>()).entries()
})

declare module 'stratal/rate-limiter' {
  interface RateLimiterRegistry {
    /**
     * Register a rate-limit rule for a better-auth path pattern. The rule
     * is projected into better-auth's `rateLimit.customRules` automatically
     * when both modules are imported.
     *
     * @example
     * limiter.forPath('/sign-in/email', () => Limit.perSeconds(10, 3))
     * limiter.forPath('/two-factor/*', async (req) => { ... })
     * limiter.forPath('/forget-password', () => Limit.none())
     */
    forPath(path: string, resolver: PathLimitResolver): void

    /**
     * Iterate every path-keyed entry registered via `forPath`. Used by the
     * auth bridge to project entries into better-auth's `customRules`.
     */
    pathEntries(): IterableIterator<[string, PathLimitResolver]>
  }
}

const BETTER_AUTH_KEY_PREFIX = 'ba-rl:'

/** Outcome of a single `consume` step. */
interface BetterAuthConsumeResult {
  allowed: boolean
  retryAfter: number | null
}

/**
 * Adapt Stratal's `IRateLimiterStore` into better-auth's `customStorage` shape.
 *
 * Better-auth requires a single atomic `consume(key, rule)` rather than the
 * separate `get`/`set` pair it used to accept, because a split read and write
 * cannot hold a limit under concurrent requests. `IRateLimiterStore` is a plain
 * typed KV with no compare-and-set, so this is better-auth's documented
 * read-decide-write fallback for backends lacking an atomic primitive, and the
 * decision below mirrors their reference implementation exactly.
 *
 * Accuracy therefore follows the configured store, and matches what Stratal's
 * own throttling already does on the same backend: exact on
 * `InMemoryRateLimiterStore` (read-decide-write is atomic in a single isolate),
 * best-effort on `KvRateLimiterStore`, where concurrent writes from different
 * edge locations may undercount. Register a Durable Object store for strict
 * accuracy across edges — the same escape hatch the KV store documents.
 */
export function createBetterAuthRateLimitStorage(store: IRateLimiterStore): {
  consume: (key: string, rule: BetterAuthRateLimitRule) => Promise<BetterAuthConsumeResult>
} {
  return {
    async consume(key, rule) {
      const storageKey = `${BETTER_AUTH_KEY_PREFIX}${key}`
      const windowMs = rule.window * 1000
      const now = Date.now()
      const record = await store.get<BetterAuthRateLimit>(storageKey)

      // TTL is the window itself: once it elapses an expired record and a
      // surviving one are treated the same, so there is nothing to preserve.
      // `KvRateLimiterStore` raises this to KV's 60s floor on its own.
      const write = async (count: number, lastRequest: number): Promise<void> => {
        await store.set(storageKey, { key, count, lastRequest }, rule.window)
      }

      // Unseen key, or the previous window has elapsed — open a new one at 1.
      if (!record || now - record.lastRequest >= windowMs) {
        await write(1, now)
        return { allowed: true, retryAfter: null }
      }

      // Window is live and already spent. Leave the record alone so a rejected
      // request can't extend the window it just bounced off.
      if (record.count >= rule.max) {
        return {
          allowed: false,
          retryAfter: Math.ceil((record.lastRequest + windowMs - now) / 1000),
        }
      }

      await write(record.count + 1, now)
      return { allowed: true, retryAfter: null }
    },
  }
}

/**
 * Project every `forPath` entry on the registry into better-auth's
 * `customRules` shape. Each entry becomes an async function that resolves
 * the user's `Limit`(s) and reduces them to a single `{ window, max }` pair
 * (or `false` for `Limit.none()`).
 *
 * Multi-`Limit` reduction picks the most restrictive — smallest
 * `max / windowSeconds` ratio; ties favour the first.
 */
export function projectCustomRules(
  registry: RateLimiterRegistry,
): Record<string, BetterAuthCustomRule> {
  const rules: Record<string, BetterAuthCustomRule> = {}

  for (const [path, resolver] of registry.pathEntries()) {
    rules[path] = async (req: Request): Promise<BetterAuthRateLimitRule | false> => {
      const resolved = await resolver(req)
      const candidates = (Array.isArray(resolved) ? resolved : [resolved]).filter((l) => !l.disabled)
      if (candidates.length === 0) return false

      const chosen = candidates.reduce((a, b) =>
        a.max / a.windowSeconds <= b.max / b.windowSeconds ? a : b,
      )

      return { window: chosen.windowSeconds, max: chosen.max }
    }
  }

  return rules
}
