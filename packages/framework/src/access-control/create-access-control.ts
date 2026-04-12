import type { Role, Statements } from 'better-auth/plugins/access'
import { createAccessControl as baCreateAC } from 'better-auth/plugins/access'
import type { AccessControlOptions, RolePermissions } from './types'

/**
 * Define access control resources and roles in one place.
 *
 * Returns `{ ac, roles }` — spread this directly into `accessControl`,
 * `admin({ ...permissions })`, or `organization({ ...permissions })`.
 *
 * @example
 * ```typescript
 * export const permissions = createAccessControl({
 *   resources: {
 *     posts: ['create', 'read', 'update', 'delete'],
 *     admin: ['access'],
 *   } as const,
 *   roles: {
 *     admin: { posts: ['create', 'read', 'update', 'delete'], admin: ['access'] },
 *     user:  { posts: ['create', 'read'] },
 *   },
 * })
 *
 * // In AuthModule:
 * accessControl: permissions
 *
 * // With Better Auth admin plugin (same object):
 * plugins: [admin({ ...permissions })]
 * ```
 */
export function createAccessControl<
  TResources extends Statements,
  TRoles extends Record<string, RolePermissions<TResources>>,
>(config: {
  resources: TResources
  roles: TRoles
}): AccessControlOptions<TResources, TRoles> {
  const ac = baCreateAC(config.resources)
  const roles = Object.fromEntries(
    Object.entries(config.roles).map(([name, perms]) => [name, ac.newRole(perms as unknown as Statements)])
  ) as { [K in keyof TRoles]: Role<TResources> }
  return { ac, roles }
}
