import { newCachedEnforcer, newModelFromString, type Enforcer } from 'casbin'
import { DI_TOKENS, Transient } from 'stratal/di'
import { inject } from 'tsyringe'
import { CustomZenStackAdapter, type CasbinDbClient } from '../adapters/custom-zenstack-adapter'
import { RBAC_TOKENS } from '../tokens'
import type { RbacModuleOptions } from '../types'

/**
 * CasbinEnforcerService
 *
 * Manages the Casbin enforcer instance for authorization.
 * Model, default policies, and role hierarchy are provided via DI options.
 */
@Transient()
export class CasbinEnforcerService {
  protected enforcer: Enforcer | null = null

  constructor(
    @inject(DI_TOKENS.Database)
    protected readonly db: CasbinDbClient,
    @inject(RBAC_TOKENS.Options)
    protected readonly options: RbacModuleOptions,
  ) { }

  /**
   * Get or create the enforcer instance
   */
  async getEnforcer(): Promise<Enforcer> {
    this.enforcer ??= await this.createEnforcer();
    return this.enforcer
  }

  /**
   * Create a new enforcer instance.
   * Can be overridden by subclasses to customize enforcer creation.
   */
  protected async createEnforcer(): Promise<Enforcer> {
    const model = newModelFromString(this.options.model)

    const adapter = CustomZenStackAdapter.newAdapter(this.db)
    const enforcer = await newCachedEnforcer(model, adapter)
    await enforcer.loadPolicy()
    return enforcer
  }

  /**
   * Seed default policies into database
   */
  async seedPolicies(): Promise<void> {
    const enforcer = await this.getEnforcer()
    const policies = this.options.defaultPolicies ?? []

    for (const [role, resource, action] of policies) {
      await enforcer.addPolicy(role, resource, action)
    }

    await enforcer.savePolicy()
  }

  /**
   * Clear cached enforcer instance
   */
  clearCache(): void {
    this.enforcer = null
  }

  /**
   * Seed role hierarchy into database
   */
  async seedRoleHierarchy(): Promise<void> {
    const enforcer = await this.getEnforcer()
    const hierarchy = this.options.roleHierarchy ?? []

    for (const [childRole, parentRole] of hierarchy) {
      await enforcer.addGroupingPolicy(childRole, parentRole)
    }

    await enforcer.savePolicy()
  }
}
