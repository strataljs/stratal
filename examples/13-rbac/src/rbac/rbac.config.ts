import type { RbacModuleOptions } from '@stratal/framework/rbac'

// Casbin PERM model with role inheritance
const RBAC_MODEL = `
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && keyMatch(r.obj, p.obj) && regexMatch(r.act, p.act)
`

export const rbacConfig: RbacModuleOptions = {
  model: RBAC_MODEL,

  // Default permission policies: [role, resource:scope, httpMethodRegex]
  defaultPolicies: [
    // Admin can do everything
    ['admin', 'articles:*', '.*'],
    ['admin', 'roles:*', '.*'],

    // Editor can read and write articles
    ['editor', 'articles:read', 'get'],
    ['editor', 'articles:write', 'post|put|patch'],

    // Viewer can only read articles
    ['viewer', 'articles:read', 'get'],
  ],

  // Role hierarchy: [childRole, parentRole]
  // admin inherits all editor permissions, editor inherits all viewer permissions
  roleHierarchy: [
    ['admin', 'editor'],
    ['editor', 'viewer'],
  ],
}
