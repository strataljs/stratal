import { DI_TOKENS, Transient } from 'stratal/di'
import type { AuthGuardOptions, CanActivate, GuardClass } from 'stratal/guards'
import { LOGGER_TOKENS, type LoggerService } from 'stratal/logger'
import type { RouterContext } from 'stratal/router'
import { inject } from 'tsyringe'
import { InsufficientPermissionsError } from '../access-control/errors/insufficient-permissions.error'
import type { AccessService } from '../access-control/services/access.service'
import { AC_TOKENS } from '../access-control/tokens'
import type { AuthContext } from '../context/auth-context'
import { UserNotAuthenticatedError } from '../context/errors'

function parsePermissions(raw: string | string[]): Record<string, string[]> {
  const list = Array.isArray(raw) ? raw : [raw]
  return list.reduce<Record<string, string[]>>((acc, perm) => {
    const colon = perm.indexOf(':')
    const resource = colon === -1 ? perm : perm.slice(0, colon)
    const action = colon === -1 ? '*' : perm.slice(colon + 1)
    ;(acc[resource] ??= []).push(action)
    return acc
  }, {})
}


/**
 * AuthGuard Factory
 *
 * Creates a guard class that enforces authentication and optional authorization.
 *
 * **Authentication (no permissions):**
 * - Checks if user is authenticated via AuthContext.isAuthenticated()
 * - Throws UserNotAuthenticatedError (401) if not authenticated
 *
 * **Authorization (with permissions):**
 * - First verifies authentication
 * - Then checks permissions via AccessService (reads from AuthContext — no DB hit)
 * - Throws InsufficientPermissionsError (403) if unauthorized
 *
 * @param options - Configuration options
 * @param options.permissions - Required permissions keyed by resource
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
 * @UseGuards(AuthGuard({ permissions: 'posts:update' }))
 * @UseGuards(AuthGuard({ permissions: ['posts:update', 'posts:delete'] }))
 * export class PostsController { }
 * ```
 */
export function AuthGuard(options?: AuthGuardOptions): GuardClass {
  const rawPermissions = options?.permissions
  const permissions = rawPermissions ? parsePermissions(rawPermissions) : undefined

  @Transient()
  class ConfiguredAuthGuard implements CanActivate {
    constructor(
      @inject(DI_TOKENS.AuthContext) private readonly authContext: AuthContext,
      @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService,
      @inject(AC_TOKENS.AccessService, { isOptional: true }) private readonly accessService?: AccessService
    ) { }

    async canActivate(_context: RouterContext): Promise<boolean> {
      if (!this.authContext.isAuthenticated()) {
        this.logger.debug('Auth guard: User not authenticated')
        throw new UserNotAuthenticatedError()
      }

      if (!permissions || Object.keys(permissions).length === 0) {
        this.logger.debug('Auth guard: Authentication passed (no permissions required)')
        return true
      }

      const userId = this.authContext.getUserId()
      if (!userId) {
        this.logger.debug('Auth guard: No user ID in context')
        throw new InsufficientPermissionsError(rawPermissions!, undefined)
      }

      if (this.accessService) {
        const allowed = await this.accessService.hasPermission(userId, permissions)

        this.logger.debug('Auth guard: Authorization check', {
          userId,
          permissions,
          allowed,
        })

        if (!allowed) {
          throw new InsufficientPermissionsError(rawPermissions!, userId)
        }
      }

      return true
    }
  }

  return ConfiguredAuthGuard
}
