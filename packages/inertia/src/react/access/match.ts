import type { Check, SharedAccess } from '../../access/types'

/**
 * Resolves a permission string against a shared permission set.
 *
 * The grammar matches `AuthGuard` exactly, so a string copy-pasted between a
 * guard and a component means the same thing in both places:
 *
 * - `posts:update` — that specific action
 * - `posts` or `posts:*` — any action on the resource
 *
 * A single-permission check here is equivalent to the server's `AuthGuard`
 * check. An `all` group is not: `evaluate()` ANDs over the caller's merged
 * permissions across every held role, while `AuthGuard` requires one single
 * role to satisfy the entire set. A user with two roles that each satisfy
 * half of an `all` list can pass here and still get a 403 from `AuthGuard`.
 */
export function matchesPermission(access: SharedAccess, permission: string): boolean {
  const colon = permission.indexOf(':')
  const resource = colon === -1 ? permission : permission.slice(0, colon)
  const action = colon === -1 ? '*' : permission.slice(colon + 1)

  const actions = access.permissions[resource]
  if (!actions || actions.length === 0) return false

  return action === '*' || actions.includes(action)
}

/** Resolves a role name against the user's held roles. */
export function matchesRole(access: SharedAccess, role: string): boolean {
  return access.roles.includes(role)
}

/** Applies a matcher across a single value, an `any` group, or an `all` group. */
export function evaluate<T extends string>(
  access: SharedAccess,
  check: Check<T>,
  matches: (access: SharedAccess, value: T) => boolean,
): boolean {
  if (typeof check === 'string') return matches(access, check)
  if ('any' in check) return check.any.some((value) => matches(access, value))
  return check.all.every((value) => matches(access, value))
}
