/**
 * Configuration options for the RBAC module
 */
export interface RbacModuleOptions {
  /** Casbin PERM model string */
  model: string
  /** Default policies: [role, resource, action][] */
  defaultPolicies?: readonly (readonly [string, string, string])[]
  /** Role hierarchy: [childRole, parentRole][] */
  roleHierarchy?: readonly (readonly [string, string])[]
}
