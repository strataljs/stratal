import type { AccessControl, Role, Statements } from 'better-auth/plugins/access'

/**
 * Merges two Statements types, unioning the action arrays for overlapping resource keys.
 *
 * @example
 * ```typescript
 * type A = { posts: readonly ['create', 'read'] }
 * type B = { posts: readonly ['update']; admin: readonly ['access'] }
 * type M = MergeStatements<A, B>
 * // → { posts: readonly ('create' | 'read' | 'update')[]; admin: readonly ['access'] }
 * ```
 */
type MergeStatements<
  A extends Statements,
  B extends Partial<Record<string, readonly string[]>>
> = {
  [K in keyof A | keyof B]: K extends keyof A
  ? K extends keyof B
  ? readonly (A[K][number] | NonNullable<B[K]>[number])[]
  : A[K]
  : K extends keyof B
  ? NonNullable<B[K]>
  : never
} & {}

/**
 * Extend an existing role with additional permissions.
 *
 * Duplicate resource keys are merged (actions are unioned), not overwritten.
 * Better Auth has no built-in role inheritance — use this to compose roles.
 *
 * @example
 * ```typescript
 * const adminRole = ac.newRole({ posts: ['create', 'read', 'update', 'delete'] })
 * const superAdminRole = extendRole(ac, adminRole, { users: ['ban', 'delete'] })
 * // superAdminRole has both posts and users permissions
 *
 * // Duplicate keys are merged, not overwritten:
 * const editorRole = extendRole(ac, userRole, { posts: ['update'] })
 * // if userRole had posts: ['create', 'read'], editorRole has posts: ['create', 'read', 'update']
 * ```
 */
export function extendRole<
  TParent extends Statements,
  TExtra extends Partial<Record<string, readonly string[]>>
>(
  ac: AccessControl<TParent>,
  parent: Role<TParent>,
  extra: TExtra
): Role<MergeStatements<TParent, TExtra>> {
  const merged: Record<string, string[]> = {}

  for (const [key, actions] of Object.entries(parent.statements)) {
    merged[key] = [...(actions as string[])]
  }

  for (const [key, actions] of Object.entries(extra)) {
    if (!actions) continue
    if (key in merged) {
      merged[key] = [...new Set([...merged[key], ...actions])]
    } else {
      merged[key] = [...actions]
    }
  }

  return ac.newRole(merged) as Role<MergeStatements<TParent, TExtra>>
}
