import type { Context, MiddlewareHandler } from 'hono'
import { matchedRoutes } from 'hono/route'
import type { Container } from '../../di/container'
import { shouldLoopback } from '../../response-cache/cached-entrypoint'
import { resolveCachedEntrypoint } from '../../response-cache/gateway-binding'
import { isGatewayMode } from '../../response-cache/gateway-mode'
import { RESPONSE_CACHE_TOKENS } from '../../response-cache/response-cache.tokens'
import type { GatewayPrimerService } from '../../response-cache/services/gateway-primer.service'
import type { GatewayRouteEntry, GatewayRouteTable } from '../../response-cache/services/gateway-route-table'
import type { PartitionResolverService } from '../../response-cache/services/partition-resolver.service'
import { RouterContext } from '../router-context'
import type { RouterEnv } from '../types'

/**
 * `c.executionCtx` is a Hono getter that throws when the context was built
 * without one (a bare `app.fetch(request)`), so it can only be read through a
 * `try`/`catch`.
 */
function executionContextOf(c: Context<RouterEnv>): unknown {
  try {
    return c.executionCtx
  } catch {
    return undefined
  }
}

/**
 * Find the binding for the route that will actually handle this request.
 *
 * `routePath(c)` inside a `use('*')` middleware returns `'*'` — the path *this
 * handler* was registered under, which Hono's own docstring shows — so it
 * cannot be used directly.
 *
 * `matchedRoutes(c)` returns **every** pattern that matched, in registration
 * order, which is more than the one that will run. Scanning it backward is
 * wrong, and dangerously so:
 *
 * ```ts
 * @Get('/summary') @Cacheable({ partitionBy: ['user'] })   summary() {}
 * @Get('/:id')     @Cacheable({ partitionBy: ['tenant'] }) show() {}
 * ```
 *
 * `GET /reports/summary` matches both, and static-before-parameterised is the
 * ordinary registration order. A backward scan picks `/reports/:id` and
 * forwards `{ tenant }`, while the cached entrypoint dispatches `summary()` —
 * storing a per-user response under a tenant-only key, so every user in that
 * tenant is served the first one's page.
 *
 * Scanning **forward from the handler after this middleware** picks the next
 * route that will run, which is the one whose `@Cacheable` governs the
 * response. `c.req.routeIndex` is this middleware's own position in the
 * matched list, so `+ 1` starts at the first candidate.
 *
 * This is the primary defence. `RouteRegistrationService.partitionsResolved`
 * is the second: inside the cached entrypoint it verifies that `ctx.props`
 * actually covers the executing route's declared partitions, so even a
 * mis-selected binding fails closed rather than caching under the wrong key.
 */
function lookupRoute(
  c: Context<RouterEnv>,
  table: GatewayRouteTable,
): GatewayRouteEntry | undefined {
  const routes = matchedRoutes(c)
  const method = c.req.method

  for (let i = c.req.routeIndex + 1; i < routes.length; i++) {
    const entry = table.lookup(method, routes[i].path)
    if (entry) return entry
  }

  return undefined
}

/**
 * Forward partitioned cacheable reads to the cached entrypoint.
 *
 * Both entrypoints run the *same* Hono app. This middleware is the only thing
 * that differs between them, and it differs on one bit that no client can
 * touch: whether `Stratal.fetch` marked this request's `ExecutionContext` as
 * the gateway (see `markGatewayMode`). In the cached entrypoint the mark is
 * absent, so this is a straight `next()` — which is what makes a loopback
 * loop impossible.
 *
 * In gateway mode, for a `GET`/`HEAD` on a route whose effective `partitionBy`
 * is non-empty, it primes the request container, resolves the declared
 * partitions, and re-dispatches through `ctx.exports.<Cached>({ props })` —
 * `ctx.props` being the part of the Workers Caching key that Cloudflare
 * documents as impossible to bypass, and therefore what keeps one caller's
 * cached response away from another.
 *
 * **Everything else runs inline**, which is always the safe direction: an
 * inline response never enters the cached entrypoint at all, so it can never
 * be stored. That covers a table miss, a non-`GET`/`HEAD` method, a primer
 * that short-circuited, and any partition resolver that returned
 * `null`/`undefined` or threw.
 *
 * ### Placement
 *
 * Registered in `HonoApp`'s constructor, after the request-scope and logger
 * middleware and before every application middleware:
 *
 * - **Inside** `createNoStoreFallbackMiddleware`, so a forwarded response that
 *   somehow carried no `Cache-Control` still leaves with an explicit decision.
 * - **Inside** the trailing-slash redirect, so a non-canonical URL is
 *   redirected once, by the gateway, rather than forwarded and cached under a
 *   path that would then redirect again.
 * - **Inside** the request-scope middleware, because primers and partition
 *   resolvers resolve out of the request-scoped container (`ctx.user()` is a
 *   macro over the request-scoped `AuthContext`).
 * - **Inside** the logger middleware, so the gateway logs the requests it
 *   forwards — on a cache hit the app never runs, so this is the only place
 *   that observes them at all.
 * - **Outside** every application middleware (global `Router.use()`,
 *   group/route middleware, guards, validators), because on a cache hit none
 *   of those run. Running them in the gateway would double their side effects
 *   on a miss and produce behaviour a hit could never reproduce.
 */
export function createGatewayDispatchMiddleware(container: Container): MiddlewareHandler<RouterEnv> {
  // `ResponseCacheModule` is opt-in and registers after `HonoApp` is
  // constructed, so the table is looked up on first use, not here. The
  // separate `looked` flag matters: `??=` would reassign on every request for
  // apps *without* the module — exactly the apps that must pay nothing —
  // because `tryResolve` keeps returning `undefined`, so the memo never takes.
  let table: GatewayRouteTable | undefined
  let looked = false

  // Latches the *result* of the `ctx.exports` reachability check, not merely
  // that it ran — same reasoning as `RouteRegistrationService.bootCheckFailure`.
  // A typo'd entrypoint name cannot start resolving later in the isolate's
  // life, so failing exactly one arbitrary request and then silently running
  // every partitioned route inline forever is the outcome to avoid.
  let bootChecked = false
  let bootFailure: Error | undefined

  return async (c, next) => {
    // Deliberately before the `executionCtx` read. `c.executionCtx` is a getter
    // that *throws* when the context was built without one, and a caught throw
    // per request is far from free — the request/response benchmark moved 2-5%
    // when this ran first. Checking the memoised table costs a boolean and a
    // property read, and short-circuits every app that configures no gateway,
    // which is the population that must pay as close to nothing as possible.
    if (!looked) {
      looked = true
      table = container.tryResolve<GatewayRouteTable>(RESPONSE_CACHE_TOKENS.GatewayRouteTable)
    }

    const routeTable = table
    const entrypoint = routeTable?.entrypoint
    if (!routeTable || !entrypoint) return next()

    const ctx = executionContextOf(c)
    if (!isGatewayMode(ctx)) return next()

    if (!bootChecked) {
      bootChecked = true
      try {
        resolveCachedEntrypoint(ctx, entrypoint)
      } catch (error) {
        bootFailure = error as Error
      }
    }
    if (bootFailure) throw bootFailure

    // An app that configures a gateway but declares no partitioned route pays
    // exactly this check per request.
    if (routeTable.isEmpty) return next()

    const entry = lookupRoute(c, routeTable)
    if (!entry) return next()
    if (!shouldLoopback(c.req.method, entry)) return next()

    const routerContext = new RouterContext(c)

    const primers = container.tryResolve<GatewayPrimerService>(RESPONSE_CACHE_TOKENS.GatewayPrimerService)
    if (primers && !(await primers.prime(routerContext))) return next()

    const resolver = container.tryResolve<PartitionResolverService>(
      RESPONSE_CACHE_TOKENS.PartitionResolverService,
    )
    if (!resolver) return next()

    const { props, resolved } = await resolver.resolve(routerContext, entry.partitionBy)
    if (!resolved) return next()

    // The callable form of a loopback binding is what selects the callee's
    // `ctx.props`; `.fetch` on the binding itself would forward with the
    // gateway's own props and collapse every caller onto one cache entry.
    return resolveCachedEntrypoint(ctx, entrypoint)({ props }).fetch(c.req.raw)
  }
}
