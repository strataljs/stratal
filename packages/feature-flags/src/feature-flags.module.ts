import { Module } from 'stratal/module'
import type { AsyncModuleOptions, DynamicModule } from 'stratal/module'
import { FEATURE_FLAG_TOKENS } from './feature-flags.tokens'
import { FeatureFlagService } from './services/feature-flag.service'
import type { FeatureFlagModuleOptions } from './types'

/**
 * Feature Flag Module
 *
 * Evaluates Cloudflare Flagship feature flags through the native Worker binding.
 * Declare your apps (and the flags you use) once; inject {@link FeatureFlagService}
 * to evaluate them.
 *
 * To expose flags to an Inertia frontend, register {@link FeatureFlagShareMiddleware}
 * yourself — scope it to the controllers that render pages (`router.middleware(...)`)
 * or app-wide (`router.use(...)`) from a module's `configureRoutes`. It is not
 * registered for you, so a stalled Flagship binding never blocks unrelated routes.
 *
 * @example
 * ```typescript
 * FeatureFlagModule.forRoot({
 *   apps: [{ binding: 'FLAGS', flags: { 'new-checkout': false } }],
 *   context: (ctx) => ({ userId: ctx.user().id }), // ctx.user() from @stratal/framework
 * })
 *
 * // Or async, from config namespaces:
 * FeatureFlagModule.forRootAsync({
 *   inject: [flagsConfig.KEY],
 *   useFactory: (cfg) => ({ apps: cfg.apps, default: cfg.default }),
 * })
 * ```
 */
@Module({
  providers: [
    { provide: FEATURE_FLAG_TOKENS.FeatureFlagService, useClass: FeatureFlagService },
  ],
})
export class FeatureFlagModule {
  /** Configure with static options. */
  static forRoot(options: FeatureFlagModuleOptions): DynamicModule {
    return {
      module: FeatureFlagModule,
      providers: [
        { provide: FEATURE_FLAG_TOKENS.Options, useValue: options },
      ],
    }
  }

  /** Configure with an async factory (when options depend on other services). */
  static forRootAsync(options: AsyncModuleOptions<FeatureFlagModuleOptions>): DynamicModule {
    return {
      module: FeatureFlagModule,
      providers: [
        {
          provide: FEATURE_FLAG_TOKENS.Options,
          useFactory: options.useFactory,
          inject: options.inject,
        },
      ],
    }
  }
}
