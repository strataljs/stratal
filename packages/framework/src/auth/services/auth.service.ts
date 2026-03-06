import type { Auth, BetterAuthOptions } from 'better-auth'
import { betterAuth } from 'better-auth'
import { inject } from 'tsyringe'
import { Transient } from 'stratal/di'
import { AUTH_OPTIONS, AUTH_SERVICE } from '../auth.tokens'
import { getErrorHandlerConfig } from '../utils'

/**
 * AuthService
 *
 * Base authentication service using Better Auth.
 * Configured via AuthModule.withRootAsync() from the application layer.
 *
 * **Extensibility:**
 * Extend this class in application layer to add custom methods.
 *
 * @example
 * ```typescript
 * @Transient(AUTH_SERVICE)
 * export class AppAuthService extends AuthService<AuthOptions> {
 *   async signInMagicLink(email: string) {
 *     return wrapBetterAuth(async () => {
 *       return this.auth.api.signInMagicLink({ body: { email }, headers: new Headers() })
 *     })
 *   }
 * }
 * ```
 */
@Transient(AUTH_SERVICE)
export class AuthService<TOptions extends BetterAuthOptions = BetterAuthOptions> {
  private authInstance: Auth<TOptions>

  constructor(
    @inject(AUTH_OPTIONS) protected readonly options: TOptions
  ) {
    this.authInstance = betterAuth({
      ...this.options,
      onAPIError: getErrorHandlerConfig()
    }) as Auth<TOptions>
  }

  /**
   * Get the Better Auth instance
   */
  get auth(): Auth<TOptions> {
    return this.authInstance
  }
}
