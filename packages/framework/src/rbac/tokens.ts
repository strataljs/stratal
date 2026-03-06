/**
 * RBAC DI Tokens
 */
export const RBAC_TOKENS = {
  /** Request-scoped Casbin service with auto context resolution */
  CasbinService: Symbol.for('CasbinService'),
  /** RBAC module options (model, policies, hierarchy) */
  Options: Symbol.for('RbacModuleOptions'),
} as const
