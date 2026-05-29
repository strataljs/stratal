import { Transient, inject } from 'stratal/di'
import type { Middleware, Next, RouterContext } from 'stratal/router'
import { FEATURE_FLAG_TOKENS } from './feature-flags.tokens'
import type { FeatureFlagService } from './services/feature-flag.service'

// `ctx.share` is contributed at runtime by `@stratal/inertia` (an optional peer).
// Declared here so this package types the call without importing Inertia; the
// signature matches Inertia's, so the declarations merge when both are present.
declare module 'stratal/router' {
  interface RouterContext {
    share(key: string, value: unknown): void
  }
}

/**
 * Evaluates the declared flag manifest for the default app and shares it as the
 * `featureFlags` prop on every Inertia page rendered during the request.
 *
 * Only runs on `GET` requests — page renders (full visits and partial reloads)
 * are always `GET`, so mutating API calls don't trigger evaluation. No-ops when
 * Inertia is not installed (`ctx.share` absent), so `FeatureFlagModule` is safe
 * in pure-API workers. Registered by `FeatureFlagModule`.
 */
@Transient()
export class FeatureFlagShareMiddleware implements Middleware {
  constructor(
    @inject(FEATURE_FLAG_TOKENS.FeatureFlagService) private readonly flags: FeatureFlagService,
  ) {}

  async handle(ctx: RouterContext, next: Next): Promise<void> {
    if (ctx.c.req.method === 'GET' && typeof ctx.share === 'function') {
      ctx.share('featureFlags', await this.flags.all())
    }
    await next()
  }
}
