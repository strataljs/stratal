import type { AccessControl, Role, Statements } from 'better-auth/plugins/access'
import { createAccessControl as baCreateAC } from 'better-auth/plugins/access'
import type { AccessControlOptions } from './types'

type RolePermissions<TStatements extends Statements> = {
  [K in keyof TStatements]?: readonly TStatements[K][number][]
}

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
}): AccessControlOptions<TResources> & { ac: AccessControl<TResources>; roles: { [K in keyof TRoles]: Role<TResources> } } {
  const ac = baCreateAC(config.resources)
  const roles = Object.fromEntries(
    Object.entries(config.roles).map(([name, perms]) => [name, ac.newRole(perms as unknown as Statements)])
  ) as { [K in keyof TRoles]: Role<TResources> }
  return { ac, roles }
}
