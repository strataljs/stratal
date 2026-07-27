import type { PurgeSpec } from 'stratal/response-cache'
import type { TestWorkersCache } from './test-workers-cache'

/** One `ctx.exports.<Name>.fetch()` the gateway made, recorded for assertion. */
export interface LoopbackCall {
  /** The export name the gateway dispatched to — `gateway: { entrypoint }`. */
  entrypoint: string
  method: string
  url: string
  /** The resolved partitions the gateway placed in `ctx.props`. */
  props: Record<string, unknown>
}

/** Runs a loopback in cached mode. Installed by the testing module builder. */
export type LoopbackHandler = (
  request: Request,
  props: Record<string, unknown>,
) => Promise<Response>

/**
 * In-memory stand-in for `ctx.exports` — the loopback bindings a Worker has to
 * its own top-level exports.
 *
 * Neither Miniflare nor workerd populates `ExecutionContext.exports` for a
 * `Test.createTestingModule()` app, so without this every consumer that adopts
 * `ResponseCacheModule.forRoot({ gateway: { entrypoint } })` would have their
 * whole suite fail on the first request: the gateway's boot verification
 * throws `ResponseCacheConfigError` the moment it cannot reach the configured
 * entrypoint. That is the same usability defect {@link TestWorkersCache} fixes
 * for `ctx.cache`, and it is fixed the same way — installed by default, opt out
 * with `Test.createTestingModule({ cache: false })`.
 *
 * The stub is not inert. A dispatched request is re-run through the *same*
 * Hono app with an unmarked execution context carrying the gateway's chosen
 * `props` — exactly what the real cached entrypoint does — so a partitioned
 * route is genuinely exercised end to end rather than short-circuited. Every
 * call is recorded, in order, for assertion via `module.gateway.loopbacks`,
 * mirroring `module.cache.purges`:
 *
 * ```typescript
 * await module.http.get('/dashboard').withHeaders({ ... }).send()
 * expect(module.gateway.loopbacks).toEqual([
 *   { entrypoint: 'Cached', method: 'GET', url: '...', props: { user: 'u-1' } },
 * ])
 * ```
 *
 * An empty `loopbacks` after a request to a partitioned route is itself the
 * assertion for the fail-closed cases — an unresolved partition, a non-GET, a
 * route with no `partitionBy` — all of which must run inline.
 *
 * Purges forwarded over RPC (`ctx.exports.<Name>.purge(spec)`) land on the same
 * {@link TestWorkersCache} as a direct `ctx.cache.purge()`, so
 * `module.cache.purges` reads identically whether or not a gateway is
 * configured.
 */
export class TestWorkerExports {
  /** Every loopback dispatch, in call order. */
  readonly loopbacks: LoopbackCall[] = []

  private handler: LoopbackHandler | undefined
  private readonly stubs = new Map<string, unknown>()

  constructor(private readonly cache: TestWorkersCache | undefined) {}

  /**
   * Install the function that actually serves a loopback.
   *
   * Set after the `Application` exists, because the handler needs its Hono
   * app — while the execution context carrying this stub has to be built
   * before it, to be passed to the constructor.
   *
   * @internal
   */
  setHandler(handler: LoopbackHandler): void {
    this.handler = handler
  }

  /**
   * The object to install as `ctx.exports`.
   *
   * A `Proxy` rather than a fixed record because the export name is the
   * consumer's to choose — the framework only ever sees the string in
   * `gateway: { entrypoint }`. Answering for every name keeps a typo'd
   * entrypoint from being caught here, in a stub, instead of in the
   * consumer's real Wrangler config where it matters; that trade is
   * deliberate, since a suite failing on a name the test never mentions is
   * far more confusing than a deploy-time error.
   *
   * A typo is meant to be caught earlier still: `gateway.entrypoint` is typed
   * as `CachedEntrypointName`, so once the consumer has run `wrangler types` a
   * wrong name is a compile error at the config site — before this stub, and
   * before deploy. This Proxy is the runtime fallback for projects without
   * generated types, not the primary guard.
   */
  get context(): Record<string, unknown> {
    return new Proxy(
      {},
      {
        get: (_target, property) =>
          typeof property === 'string' ? this.stubFor(property) : undefined,
        has: () => true,
        ownKeys: () => [...this.stubs.keys()],
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
      },
    )
  }

  /**
   * A loopback binding, shaped like the real one:
   * `Fetcher<T> & ((opts: { props }) => Fetcher<T>)`. Both the callable form
   * (which is how `ctx.props` is chosen) and the direct form are supported,
   * so whichever the framework uses is genuinely exercised.
   */
  private stubFor(entrypoint: string): unknown {
    const existing = this.stubs.get(entrypoint)
    if (existing) return existing

    const bound = (props: Record<string, unknown>) => ({
      fetch: (request: Request) => this.dispatch(entrypoint, request, props),
      purge: (spec: PurgeSpec) => this.purge(spec),
    })

    const stub = Object.assign(
      (options?: { props?: Record<string, unknown> }) => bound(options?.props ?? {}),
      bound({}),
    )

    this.stubs.set(entrypoint, stub)
    return stub
  }

  private async dispatch(
    entrypoint: string,
    request: Request,
    props: Record<string, unknown>,
  ): Promise<Response> {
    this.loopbacks.push({ entrypoint, method: request.method, url: request.url, props })

    if (!this.handler) {
      throw new Error(
        '[stratal:testing] A gateway loopback was dispatched before the testing module finished ' +
          'compiling. This is a bug in @stratal/testing — please report it.',
      )
    }

    return this.handler(request, props)
  }

  private async purge(spec: PurgeSpec): Promise<{ success: boolean }> {
    // Recorded on the same stub a direct `ctx.cache.purge()` writes to, so
    // `module.cache.purges` reads the same with or without a gateway.
    await this.cache?.purge(spec)
    return { success: true }
  }
}
