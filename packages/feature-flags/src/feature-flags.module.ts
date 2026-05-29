import { Module } from 'stratal/module'
import type { AsyncModuleOptions, DynamicModule } from 'stratal/module'
import type { RouteConfigurable, Router } from 'stratal/router'
import { FeatureFlagShareMiddleware } from './feature-flag-share.middleware'
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
 * When `@stratal/inertia` is also present, declared flags are auto-shared to
 * every Inertia page as the `featureFlags` prop (read them with `useFlag` /
 * `useFeatureFlags` from `@stratal/feature-flags/react`) — no extra wiring. In
 * a pure-API worker the auto-share middleware is a no-op.
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
export class FeatureFlagModule implements RouteConfigurable {
  /** Auto-shares declared flags to every Inertia page (no-op without Inertia). */
  configureRoutes(router: Router): void {
    router.use(FeatureFlagShareMiddleware)
  }

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
