/**
 * Augments Stratal's `RouterContext` with a `user()` accessor backed by the
 * request-scoped {@link AuthContext}.
 *
 * Side-effect import: registers the `user` macro on `RouterContext` and the
 * `declare module` augmentation that exposes it at the type level. Imported by
 * {@link AuthModule} so it runs whenever auth is configured.
 */
import { DI_TOKENS } from 'stratal/di'
import { RouterContext } from 'stratal/router'
import type { AuthContext, AuthUser } from './auth-context'

declare module 'stratal/router' {
  interface RouterContext {
    /**
     * The authenticated user for the current request.
     *
     * Throws `UserNotAuthenticatedError` if the request is unauthenticated.
     * Provided by `@stratal/framework`'s `AuthModule` via {@link AuthContext}.
     */
    user(): AuthUser
  }
}

RouterContext.macro('user', function (this: RouterContext): AuthUser {
  return this.getContainer().resolve<AuthContext>(DI_TOKENS.AuthContext).requireUser()
})
