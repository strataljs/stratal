import type { Constructor } from '../../types'
import { inject } from '../../di'
import { Singleton } from '../../di/decorators'
import { LOGGER_TOKENS, type LoggerService } from '../../logger'
import type { Middleware } from '../../router/middleware.interface'
import type { RouterContext } from '../../router/router-context'
import { RESPONSE_CACHE_TOKENS } from '../response-cache.tokens'
import type { ResponseCacheModuleOptions } from '../types'

/**
 * Runs registered middleware in the gateway before partition resolution, so a
 * resolver sees the same `RouterContext` it would inside the app.
 *
 * `ctx.user()` is a macro over the request-scoped `AuthContext`, which
 * `SessionVerificationMiddleware` populates imperatively inside the app's
 * middleware chain. Without priming, that chain has not run and `ctx.user()`
 * throws. `AuthModule` does **not** register anything here: `@stratal/
 * framework` exports `AUTH_GATEWAY_PRIMERS`, which a consumer passes
 * explicitly via `ResponseCacheModule.forRoot({ primers })`.
 *
 * Called by `createGatewayDispatchMiddleware`, and only for `@Cacheable`
 * routes that declare `partitionBy` — a public cacheable route and every
 * non-cacheable route skip the chain entirely.
 */
@Singleton(RESPONSE_CACHE_TOKENS.GatewayPrimerService)
export class GatewayPrimerService {
  constructor(
    @inject(RESPONSE_CACHE_TOKENS.Options) private readonly options: ResponseCacheModuleOptions,
    @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService,
  ) {}

  get hasPrimers(): boolean {
    return (this.options.primers?.length ?? 0) > 0
  }

  /**
   * Run every primer in registration order.
   *
   * @returns `true` when the whole chain ran to completion, `false` when a
   *   primer short-circuited.
   *
   * `Middleware.handle` may return a `Response` to short-circuit its chain — an
   * auth middleware rejecting a request, for example. In the gateway that
   * `Response` is **not** the answer to send: primers run only to populate the
   * request container before partition resolution, and the real middleware
   * chain still runs inside the app, where the same middleware will produce the
   * same rejection through the application's own pipeline (exception handler,
   * logging, Inertia error shaping). Answering from the gateway would make it a
   * second, partially-run response pipeline whose output is assembled by a
   * *subset* of the app's middleware.
   *
   * So the `Response` is dropped — but not silently. A short-circuit means the
   * container was never fully primed, so partition resolution cannot be
   * trusted; the caller must fail closed and run the request inline instead of
   * caching it.
   */
  async prime(ctx: RouterContext): Promise<boolean> {
    const primers = this.options.primers ?? []
    const container = ctx.getContainer()

    for (const Primer of primers) {
      const middleware = container.resolve<Middleware>(Primer as Constructor<Middleware>)
      // Primers exist for their side effects on the request container, so the
      // chain terminates here rather than continuing to a handler.
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- terminating next for side-effect middleware
      const result = await middleware.handle(ctx, async () => {})

      if (result instanceof Response) {
        this.logger.debug('[stratal:response-cache] Primer short-circuited; not caching', {
          primer: (Primer as Constructor<Middleware>).name,
          status: result.status,
        })
        return false
      }
    }

    return true
  }
}
