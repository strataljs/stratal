/**
 * RBAC Constants
 */
export const RBAC_CONTEXT_KEYS = {
  /** Key for storing required authorization scopes (permissions) in context */
  AUTH_SCOPES: Symbol('rbac:authScopes'),
} as const
