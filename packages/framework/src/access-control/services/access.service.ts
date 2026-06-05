import type { DatabaseService } from '@stratal/framework/database'
import { DI_TOKENS, inject, Request } from 'stratal/di'
import type { AuthContext } from '../../context/auth-context'
import { AC_TOKENS } from '../tokens'
import type { AccessControlOptions } from '../types'

function parseRoles(role: string | null | undefined): string[] {
  if (!role) return []
  return role.split(',').map(r => r.trim()).filter(Boolean)
}

/**
 * AccessService
 *
 * Request-scoped service for role and permission management.
 *
 * Roles for the current user are read from AuthContext (populated by
 * SessionVerificationMiddleware — no DB hit). Other users are resolved
 * from the database.
 *
 * Permission checks use Better Auth's `role.authorize()` locally with
 * OR logic — access is granted if any of the user's roles allows it.
 *
 * @example
 * ```typescript
 * // Check current user
 * await accessService.currentUserHasPermission({ posts: ['update'] })
 *
 * // Check arbitrary user (e.g. from an admin action)
 * await accessService.hasPermission(userId, { admin: ['access'] })
 *
 * // Assign a role
 * await accessService.setUserRole(userId, 'admin')
 *
 * // Assign multiple roles
 * await accessService.setUserRole(userId, ['editor', 'reviewer'])
 * ```
 */
@Request(AC_TOKENS.AccessService)
export class AccessService {
  constructor(
    @inject(DI_TOKENS.AuthContext)
    private readonly authContext: AuthContext,
    @inject(DI_TOKENS.Database)
    private readonly db: DatabaseService,
    @inject(AC_TOKENS.Options)
    private readonly options: AccessControlOptions
  ) { }

  /**
   * Get all roles for a user.
   *
   * Uses AuthContext for the current user (no DB hit).
   * Falls back to DB for other users.
   */
  async getUserRoles(userId: string): Promise<string[]> {
    if (userId === this.authContext.getUserId()) {
      const roles = this.authContext.getRoles()
      if (roles.length > 0) return roles
    }
    const user = await (this.db).user.findUnique({
      where: { id: userId },
      select: { role: true },
    })
    return parseRoles(user?.role)
  }

  /**
   * Assign one or more roles to a user.
   *
   * Multiple roles are stored as a comma-separated string in `user.role`.
   */
  async setUserRole(userId: string, role: string | string[]): Promise<void> {
    const roleStr = Array.isArray(role) ? role.join(',') : role
    await this.db.user.update({
      where: { id: userId },
      data: { role: roleStr },
    })
  }

  /**
   * Check if a user has the required permissions.
   *
   * Returns true if any of the user's roles grants all of the requested permissions.
   */
  async hasPermission(userId: string, permissions: Record<string, string[]>): Promise<boolean> {
    const roles = await this.getUserRoles(userId)
    return this.checkPermissions(roles, permissions)
  }

  /**
   * Get the merged permission set for a user across all their roles.
   * Useful for sending to the frontend.
   */
  async getPermissionsForUser(userId: string): Promise<Record<string, string[]>> {
    const roles = await this.getUserRoles(userId)
    return this.mergePermissions(roles)
  }

  /**
   * Get all roles for the currently authenticated user.
   * Reads from AuthContext — no DB hit.
   */
  getCurrentUserRoles(): string[] {
    return this.authContext.getRoles()
  }

  /**
   * Check if the currently authenticated user has the required permissions.
   * Reads roles from AuthContext — no DB hit.
   */
  currentUserHasPermission(permissions: Record<string, string[]>): boolean {
    const roles = this.authContext.getRoles()
    if (roles.length === 0) return false
    return this.checkPermissions(roles, permissions)
  }

  /**
   * Get merged permissions for the currently authenticated user.
   * Reads roles from AuthContext — no DB hit.
   */
  getCurrentUserPermissions(): Record<string, string[]> {
    const roles = this.authContext.getRoles()
    return this.mergePermissions(roles)
  }

  private checkPermissions(roles: string[], permissions: Record<string, string[]>): boolean {
    return roles.some(roleName => {
      const roleObj = this.options.roles[roleName]
      if (!roleObj) return false

      const specific: Record<string, string[]> = {}

      for (const [resource, actions] of Object.entries(permissions)) {
        if (actions.includes('*')) {
          // Wildcard: role must have at least one action defined for this resource
          const roleActions = (roleObj.statements as Record<string, readonly string[]>)[resource]
          if (!roleActions?.length) return false
        } else {
          specific[resource] = actions
        }
      }

      return Object.keys(specific).length === 0 || roleObj.authorize(specific).success
    })
  }

  private mergePermissions(roles: string[]): Record<string, string[]> {
    const result: Record<string, string[]> = {}
    for (const roleName of roles) {
      const roleObj = this.options.roles[roleName]
      if (!roleObj) continue
      for (const [resource, actions] of Object.entries(roleObj.statements)) {
        result[resource] ??= []
        for (const action of actions as string[]) {
          if (!result[resource].includes(action)) {
            result[resource].push(action)
          }
        }
      }
    }
    return result
  }
}
