import type { ExceptionHandler } from '../errors/exception-handler'
import { Module } from '../module'
import type { AsyncModuleOptions, DynamicModule, ModuleContext, OnException, OnInitialize } from '../module/types'
import { TooManyRequestsError } from './errors'
import { RateLimiterRegistry } from './rate-limiter-registry'
import { RATE_LIMITER_TOKENS } from './rate-limiter.tokens'
import { RateLimiterStoreFactory, type RateLimiterModuleOptions } from './stores/store-factory'
import type { IRateLimiterStore } from './stores/rate-limiter-store.interface'

/**
 * Rate limiter module — opt-in, NOT registered automatically by Application.
 *
 * Usage:
 * ```typescript
 * @Module({
 *   imports: [RateLimiterModule.forRoot({ store: 'kv', binding: 'RATE_LIMITS' })],
 * })
 * export class AppModule {}
 * ```
 *
 * Define limiters in any module's `onInitialize` hook by resolving
 * `RATE_LIMITER_TOKENS.Registry` from the container. Apply them with
 * `router.throttle('name')` or `@RateLimit('name')`.
 *
 * The module:
 *  - eagerly validates the store at app boot (`onInitialize` resolves the
 *    factory and calls `create()`); a missing `forRoot` surfaces
 *    `RateLimiterError` before any request is served.
 *  - registers a `respond()` callback on the `ExceptionHandler` (via
 *    `onException`) that injects `Retry-After` and `X-RateLimit-*` headers
 *    on every {@link TooManyRequestsError} response, regardless of whether
 *    the body was rendered as JSON, HTML, or via Inertia.
 */
@Module({
  providers: [
    { provide: RATE_LIMITER_TOKENS.Registry, useClass: RateLimiterRegistry },
    { provide: RATE_LIMITER_TOKENS.StoreFactory, useClass: RateLimiterStoreFactory },
    {
      provide: RATE_LIMITER_TOKENS.Store,
      useFactory: (factory: RateLimiterStoreFactory) => factory.create(),
      inject: [RATE_LIMITER_TOKENS.StoreFactory],
    },
  ],
})
export class RateLimiterModule implements OnInitialize, OnException {
  /**
   * Configure the rate limiter with a store choice.
   *
   * @param options - `{ store: 'kv', binding }` | `{ store: 'memory' }` | `{ store: { useClass } }`
   */
  static forRoot(options: RateLimiterModuleOptions): DynamicModule {
    return {
      module: RateLimiterModule,
      providers: [
        { provide: RATE_LIMITER_TOKENS.Options, useValue: options },
      ],
    }
  }

  /**
   * Async configuration. Use when store options depend on other services
   * (e.g. ConfigService).
   */
  static forRootAsync(options: AsyncModuleOptions<RateLimiterModuleOptions>): DynamicModule {
    return {
      module: RateLimiterModule,
      providers: [
        {
          provide: RATE_LIMITER_TOKENS.Options,
          useFactory: options.useFactory,
          inject: options.inject,
        },
      ],
    }
  }

  /**
   * Eagerly resolve the store so a missing `forRoot()` fails at boot,
   * not on the first throttled request. Also registers a per-app marker
   * value so ThrottleMiddleware can distinguish "module imported into this
   * app" from "module class loaded somewhere in the process" (the latter is
   * indistinguishable at the DI layer because @Module's `registry()` call
   * binds providers globally at decoration time).
   */
  onInitialize({ container }: ModuleContext): void {
    container.resolve<IRateLimiterStore>(RATE_LIMITER_TOKENS.Store)
    container.registerValue(RATE_LIMITER_TOKENS.ModuleMarker, { imported: true })
  }

  /**
   * Inject `Retry-After` + `X-RateLimit-*` headers on every 429 response.
   * The body itself is rendered by `ExceptionHandler.defaultRender` —
   * content-negotiated, so HTML clients (browsers, Inertia) and JSON
   * clients both get the right shape.
   */
  onException(handler: ExceptionHandler): void {
    handler.dontReport([TooManyRequestsError])
    handler.respond((response, error) => {
      if (!(error instanceof TooManyRequestsError)) return response
      response.headers.set('Retry-After', String(error.info.retryAfter))
      response.headers.set('X-RateLimit-Limit', String(error.info.limit))
      response.headers.set('X-RateLimit-Remaining', '0')
      response.headers.set('X-RateLimit-Reset', String(Math.ceil(error.info.resetAt / 1000)))
      return response
    })
  }
}
