import { inject, Transient } from 'stratal/di'
import type { Middleware, Next, RouterContext } from 'stratal/router'
import type { AccessService } from './services/access.service'
import { AC_TOKENS } from './tokens'

/**
 * The Inertia methods this middleware needs, declared structurally.
 *
 * `@stratal/framework` must not depend on `@stratal/inertia` (the dependency
 * runs the other way at the type level, via the generated registry), so the
 * two optional context methods are described here and probed at runtime
 * instead of pulled in through a `/// <reference types="..." />`.
 */
interface MaybeInertiaContext {
  share?: (key: string, value: unknown) => void
  always?: <T>(callback: () => T) => unknown
}

/**
 * Shares the current user's roles and merged permissions as the `access` prop
 * on every Inertia page rendered during the request, so the client can gate
 * rendering with `<Can>` / `<HasRole>` from `@stratal/inertia/react/access`.
 *
 * Both values come from `AuthContext` (populated by
 * `SessionVerificationMiddleware`) — no database hit and no I/O, which is why
 * this is registered globally by `AuthModule` rather than being opt-in the way
 * `FeatureFlagShareMiddleware` is.
 *
 * Inert unless access control is configured and Inertia is installed. Not
 * restricted to `GET`: an Inertia render can legally happen on any method —
 * e.g. `return ctx.inertia('Posts/Create', {...})` from a `POST` handler
 * re-rendering after a validation failure — and every `<Can>` / `useCan` on
 * that page needs `access` just as much as it would on a full `GET` visit.
 *
 * Wrapped in `ctx.always()` so partial reloads never drop the prop; the client
 * treats an absent `access` prop as a wiring error, not as "denied".
 */
@Transient()
export class AccessShareMiddleware implements Middleware {
  constructor(
    @inject(AC_TOKENS.AccessService, { isOptional: true })
    private readonly access?: AccessService,
  ) { }

  async handle(ctx: RouterContext, next: Next): Promise<void> {
    const access = this.access
    const inertia = ctx as RouterContext & MaybeInertiaContext

    if (
      access
      && typeof inertia.share === 'function'
      && typeof inertia.always === 'function'
    ) {
      inertia.share('access', inertia.always(() => ({
        roles: access.getCurrentUserRoles(),
        permissions: access.getCurrentUserPermissions(),
      })))
    }

    await next()
  }
}
