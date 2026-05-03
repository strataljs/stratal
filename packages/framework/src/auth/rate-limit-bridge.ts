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

// Better-auth manages window expiry itself by reading `lastRequest`. We still
// need a TTL on the underlying KV so dead records don't accumulate. 1 day
// covers any reasonable better-auth window without colliding with the next.
const BETTER_AUTH_TTL_SECONDS = 86_400
const BETTER_AUTH_KEY_PREFIX = 'ba-rl:'

/**
 * Adapt Stratal's `IRateLimiterStore` into better-auth's `customStorage` shape.
 * Better-auth supplies its own `RateLimit` records (`{ key, count, lastRequest }`);
 * the adapter just persists them under a separate key namespace.
 */
export function createBetterAuthRateLimitStorage(store: IRateLimiterStore): {
  get: (key: string) => Promise<BetterAuthRateLimit | null>
  set: (key: string, value: BetterAuthRateLimit, update?: boolean) => Promise<void>
} {
  return {
    async get(key) {
      return await store.get<BetterAuthRateLimit>(`${BETTER_AUTH_KEY_PREFIX}${key}`)
    },
    async set(key, value, _update) {
      await store.set(`${BETTER_AUTH_KEY_PREFIX}${key}`, value, BETTER_AUTH_TTL_SECONDS)
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
