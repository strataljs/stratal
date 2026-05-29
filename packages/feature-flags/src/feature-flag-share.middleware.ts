/// <reference types="@stratal/inertia" />

import { Transient, inject } from 'stratal/di';
import type { Middleware, Next, RouterContext } from 'stratal/router';
import { FEATURE_FLAG_TOKENS } from './feature-flags.tokens';
import type { FeatureFlagService } from './services/feature-flag.service';

/**
 * Evaluates the declared flag manifest for the default app and shares it as the
 * `featureFlags` prop on every Inertia page rendered during the request.
 *
 * Only runs on `GET` requests — page renders (full visits and partial reloads)
 * are always `GET`, so mutating API calls don't trigger evaluation. No-ops when
 * Inertia is not installed (`ctx.share` absent).
 *
 * Register it yourself, scoped to where flags are actually needed — a Flagship
 * stall then only affects those routes, not the whole app:
 *
 * ```typescript
 * configureRoutes(router: Router): void {
 *   // only the controllers that render flag-aware pages
 *   router.group([DashboardController], (r) => r.middleware(FeatureFlagShareMiddleware))
 *   // ...or app-wide: router.use(FeatureFlagShareMiddleware)
 * }
 * ```
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
