import { DI_TOKENS, Transient } from 'stratal/di'
import type { Middleware, Next, RouterContext } from 'stratal/router'
import { AuthContext } from '../../context/auth-context'

/**
 * Auth Context Middleware
 *
 * Registers AuthContext in the request container at the start of each request.
 * This MUST run before SessionVerificationMiddleware and any other middleware
 * that depends on AuthContext.
 */
@Transient()
export class AuthContextMiddleware implements Middleware {
  async handle(ctx: RouterContext, next: Next): Promise<void> {
    const requestContainer = ctx.getContainer()

    const authContext = new AuthContext()
    requestContainer.registerValue(DI_TOKENS.AuthContext, authContext)

    return next()
  }
}
