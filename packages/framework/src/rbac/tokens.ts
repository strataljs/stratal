/**
 * RBAC DI Tokens
 */
export const RBAC_TOKENS = {
  /** Request-scoped Casbin service with auto context resolution */
  CasbinService: Symbol.for('stratal:rbac:casbin:service'),
  /** RBAC module options (model, policies, hierarchy) */
  Options: Symbol.for('stratal:rbac:options'),
} as const
