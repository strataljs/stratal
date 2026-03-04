import { inject } from 'tsyringe'
import { Transient, DI_TOKENS } from 'stratal/di'
import { LOGGER_TOKENS, type LoggerService } from 'stratal/logger'
import type { RouterContext } from 'stratal/router'
import type { AuthGuardOptions, CanActivate, GuardClass } from 'stratal/guards'
import type { AuthContext } from '../context/auth-context'
import { UserNotAuthenticatedError } from '../context/errors'
import { InsufficientPermissionsError } from '../rbac/errors/insufficient-permissions.error'
import type { CasbinService } from '../rbac/services/casbin.service'
import { RBAC_TOKENS } from '../rbac/tokens'

/**
 * AuthGuard Factory
 *
 * Creates a guard class that enforces authentication and optional authorization.
 *
 * **Authentication (no scopes):**
 * - Checks if user is authenticated via AuthContext.isAuthenticated()
 * - Throws UserNotAuthenticatedError (401) if not authenticated
 *
 * **Authorization (with scopes):**
 * - First verifies authentication
 * - Then checks permissions via CasbinService
 * - Throws InsufficientPermissionsError (403) if unauthorized
 *
 * @param options - Configuration options
 * @param options.scopes - Required permissions for authorization
 * @returns Guard class for use with @UseGuards decorator
 *
 * @example Authentication only
 * ```typescript
 * @UseGuards(AuthGuard())
 * export class ProfileController { }
 * ```
 *
 * @example Authentication with permissions
 * ```typescript
 * @UseGuards(AuthGuard({ scopes: ['students:read'] }))
 * export class StudentsController { }
 * ```
 */
export function AuthGuard(options?: AuthGuardOptions): GuardClass {
  const scopes = options?.scopes

  @Transient()
  class ConfiguredAuthGuard implements CanActivate {
    constructor(
      @inject(DI_TOKENS.AuthContext) private readonly authContext: AuthContext,
      @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService,
      @inject(RBAC_TOKENS.CasbinService) private readonly casbinService: CasbinService
    ) {}

    async canActivate(context: RouterContext): Promise<boolean> {
      if (!this.authContext.isAuthenticated()) {
        this.logger.debug('Auth guard: User not authenticated')
        throw new UserNotAuthenticatedError()
      }

      if (!scopes || scopes.length === 0) {
        this.logger.debug('Auth guard: Authentication passed (no scopes required)')
        return true
      }

      const userId = this.authContext.getUserId()
      if (!userId) {
        this.logger.debug('Auth guard: No user ID in context')
        throw new InsufficientPermissionsError(scopes, undefined)
      }

      const httpMethod = context.c.req.method.toLowerCase()

      const hasPermission = await this.casbinService.hasAnyPermission(
        userId,
        scopes,
        httpMethod
      )

      this.logger.debug('Auth guard: Authorization check', {
        userId,
        scopes,
        httpMethod,
        hasPermission,
      })

      if (!hasPermission) {
        throw new InsufficientPermissionsError(scopes, userId)
      }

      return true
    }
  }

  return ConfiguredAuthGuard
}
