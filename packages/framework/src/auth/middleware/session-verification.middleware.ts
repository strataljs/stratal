import { DI_TOKENS, Transient } from 'stratal/di'
import { LOGGER_TOKENS, type LoggerService } from 'stratal/logger'
import type { Middleware, Next, RouterContext } from 'stratal/router'
import { inject } from 'tsyringe'
import { type AuthContext } from '../../context/auth-context'
import { AUTH_SERVICE } from '../auth.tokens'
import type { AuthService } from '../services/auth.service'

/**
 * Session Verification Middleware
 *
 * Verifies user session via Better Auth and populates AuthContext with
 * the authenticated user.
 *
 * **Responsibilities:**
 * - Calls Better Auth's getSession() API
 * - Populates AuthContext with the user record if the session is valid
 * - Continues request chain regardless of session status
 */
@Transient()
export class SessionVerificationMiddleware implements Middleware {
  constructor(
    @inject(AUTH_SERVICE)
    private readonly authService: AuthService,
    @inject(LOGGER_TOKENS.LoggerService) private logger: LoggerService
  ) { }

  async handle(ctx: RouterContext, next: Next): Promise<void> {
    try {
      const result = await this.authService.auth.api.getSession({
        headers: ctx.c.req.raw.headers
      })

      if (result) {
        const authContext = ctx.getContainer().resolve<AuthContext>(DI_TOKENS.AuthContext)
        authContext.setAuthContext({
          user: result.user,
        })
      }
    } catch (error: unknown) {
      this.logger.debug('Session validation failed (e.g., invalidated in DB)', { error })
    }

    return next()
  }
}
