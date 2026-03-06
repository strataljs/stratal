import { inject } from 'tsyringe'
import { Transient, DI_TOKENS } from 'stratal/di'
import type { Middleware, RouterContext } from 'stratal/router'
import { AuthContext } from '../../context/auth-context'
import { AUTH_SERVICE } from '../auth.tokens'
import type { AuthService } from '../services/auth.service'

/**
 * Session Verification Middleware
 *
 * Verifies user session via Better Auth and populates AuthContext with userId.
 *
 * **Responsibilities:**
 * - Calls Better Auth's getSession() API
 * - Populates AuthContext with userId if session is valid
 * - Continues request chain regardless of session status
 */
@Transient()
export class SessionVerificationMiddleware implements Middleware {
  constructor(
    @inject(AUTH_SERVICE)
    private readonly authService: AuthService
  ) {}

  async handle(ctx: RouterContext, next: () => Promise<void>): Promise<void> {
    const session = await this.authService.auth.api.getSession({
      headers: ctx.c.req.raw.headers
    })

    if (session) {
      const authContext = ctx.getContainer().resolve<AuthContext>(DI_TOKENS.AuthContext)
      authContext.setAuthContext({ userId: session.user.id })
    }

    await next()
  }
}
