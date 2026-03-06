import type { Enforcer } from 'casbin'
import { inject } from 'tsyringe'
import { Transient, DI_TOKENS } from 'stratal/di'
import type { AuthContext } from '../../context/auth-context'
import { RBAC_TOKENS } from '../tokens'
import { CasbinEnforcerService } from './casbin-enforcer.service'

/**
 * CasbinService
 *
 * Request-scoped service that provides the full Casbin RBAC API.
 * Uses AuthContext to get the current user.
 */
@Transient(RBAC_TOKENS.CasbinService)
export class CasbinService {
  constructor(
    @inject(DI_TOKENS.AuthContext)
    protected readonly context: AuthContext,
    @inject(CasbinEnforcerService)
    protected readonly enforcerService: CasbinEnforcerService
  ) {}

  protected async getEnforcer(): Promise<Enforcer> {
    return this.enforcerService.getEnforcer()
  }

  // ==================== USER-ROLE MANAGEMENT ====================

  async addRoleForUser(userId: string, role: string): Promise<boolean> {
    const enforcer = await this.getEnforcer()
    const added = await enforcer.addRoleForUser(userId, role)
    if (added) await enforcer.savePolicy()
    return added
  }

  async deleteRoleForUser(userId: string, role: string): Promise<boolean> {
    const enforcer = await this.getEnforcer()
    const deleted = await enforcer.deleteRoleForUser(userId, role)
    if (deleted) await enforcer.savePolicy()
    return deleted
  }

  async deleteRolesForUser(userId: string): Promise<boolean> {
    const enforcer = await this.getEnforcer()
    const deleted = await enforcer.deleteRolesForUser(userId)
    if (deleted) await enforcer.savePolicy()
    return deleted
  }

  async getRolesForUser(userId: string): Promise<string[]> {
    const enforcer = await this.getEnforcer()
    return enforcer.getRolesForUser(userId)
  }

  async getImplicitRolesForUser(userId: string): Promise<string[]> {
    const enforcer = await this.getEnforcer()
    return enforcer.getImplicitRolesForUser(userId)
  }

  async getUsersForRole(role: string): Promise<string[]> {
    const enforcer = await this.getEnforcer()
    return enforcer.getUsersForRole(role)
  }

  async getImplicitUsersForRole(role: string): Promise<string[]> {
    const enforcer = await this.getEnforcer()
    return enforcer.getImplicitUsersForRole(role)
  }

  async hasRoleForUser(userId: string, role: string): Promise<boolean> {
    const enforcer = await this.getEnforcer()
    return enforcer.hasRoleForUser(userId, role)
  }

  // ==================== ROLE HIERARCHY MANAGEMENT ====================

  async addRoleInheritance(childRole: string, parentRole: string): Promise<boolean> {
    const enforcer = await this.getEnforcer()
    const added = await enforcer.addGroupingPolicy(childRole, parentRole)
    if (added) await enforcer.savePolicy()
    return added
  }

  async deleteRoleInheritance(childRole: string, parentRole: string): Promise<boolean> {
    const enforcer = await this.getEnforcer()
    const deleted = await enforcer.removeGroupingPolicy(childRole, parentRole)
    if (deleted) await enforcer.savePolicy()
    return deleted
  }

  // ==================== USER/ROLE DELETION ====================

  async deleteUser(userId: string): Promise<boolean> {
    const enforcer = await this.getEnforcer()
    const deleted = await enforcer.deleteUser(userId)
    if (deleted) await enforcer.savePolicy()
    return deleted
  }

  async deleteRole(role: string): Promise<boolean> {
    const enforcer = await this.getEnforcer()
    const deleted = await enforcer.deleteRole(role)
    if (deleted) await enforcer.savePolicy()
    return deleted
  }

  // ==================== CONVENIENCE METHODS ====================

  async getCurrentUserRoles(): Promise<string[]> {
    const userId = this.context.getUserId()
    if (!userId) return []
    return this.getImplicitRolesForUser(userId)
  }

  async currentUserHasRole(role: string): Promise<boolean> {
    const roles = await this.getCurrentUserRoles()
    return roles.includes(role)
  }

  async setRolesForUser(userId: string, roles: string[]): Promise<void> {
    const enforcer = await this.getEnforcer()
    await enforcer.deleteRolesForUser(userId)
    for (const role of roles) {
      await enforcer.addRoleForUser(userId, role)
    }
    await enforcer.savePolicy()
  }

  // ==================== PERMISSION CHECKING ====================

  async hasPermission(userId: string, scope: string, action: string): Promise<boolean> {
    const enforcer = await this.getEnforcer()
    return enforcer.enforce(userId, scope, action)
  }

  async currentUserHasPermission(scope: string, action: string): Promise<boolean> {
    const userId = this.context.getUserId()
    if (!userId) return false
    return this.hasPermission(userId, scope, action)
  }

  async hasAnyPermission(userId: string, scopes: string[], action: string): Promise<boolean> {
    const enforcer = await this.getEnforcer()
    const requests = scopes.map(scope => [userId, scope, action])
    const results = await enforcer.batchEnforce(requests)
    return results.some(allowed => allowed)
  }

  async currentUserHasAnyPermission(scopes: string[], action: string): Promise<boolean> {
    const userId = this.context.getUserId()
    if (!userId) return false
    return this.hasAnyPermission(userId, scopes, action)
  }

  // ==================== CASBIN.JS FRONTEND SUPPORT ====================

  async getPermissionsForUserAsCasbinJs(userId: string): Promise<Record<string, string[]>> {
    const enforcer = await this.getEnforcer()
    const permissions = await enforcer.getImplicitPermissionsForUser(userId)

    const result: Record<string, string[]> = {}
    for (const [_role, resource, action] of permissions) {
      result[action] ??= []
      if (!result[action].includes(resource)) {
        result[action].push(resource)
      }
    }

    return result
  }

  async getCurrentUserPermissionsAsCasbinJs(): Promise<Record<string, string[]>> {
    const userId = this.context.getUserId()
    if (!userId) return {}
    return this.getPermissionsForUserAsCasbinJs(userId)
  }
}
