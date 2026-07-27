import type { ReactNode } from 'react'
import type { Check, Permission, RoleName } from '../../access/types'
import { useCan, useRole } from './use-access'

/**
 * Exactly one of the three forms, enforced by the union: supplying two at once
 * is a compile error rather than a precedence rule to remember.
 */
type GateProps<TKey extends string, TValue> =
  | (Record<TKey, TValue> & { any?: never; all?: never; children?: ReactNode })
  | ({ any: readonly TValue[] } & Partial<Record<TKey, never>> & { all?: never; children?: ReactNode })
  | ({ all: readonly TValue[] } & Partial<Record<TKey, never>> & { any?: never; children?: ReactNode })

export type CanProps = GateProps<'do', Permission>
export type RoleProps = GateProps<'is', RoleName>

function toCheck<TValue>(props: Record<string, unknown>, key: string): Check<TValue> {
  // `props.any !== undefined` rather than `'any' in props`: `GateProps` types the
  // off-branches as `any?: never`, which types-check an explicit `any: undefined`
  // (e.g. a spread from a conditional). `in` would still treat that branch as
  // chosen and hand `evaluate()` an `undefined` list to call `.some()` on.
  if (props.any !== undefined) return { any: props.any as readonly TValue[] }
  if (props.all !== undefined) return { all: props.all as readonly TValue[] }
  return props[key] as Check<TValue>
}

/**
 * Renders its children when the current user holds the permission(s).
 *
 * @example
 * ```ts
 * <Can do="posts:update"><EditButton /></Can>
 * <Can any={['posts:update', 'posts:delete']}><Toolbar /></Can>
 * <Can all={['posts:read', 'admin:access']}><AuditLog /></Can>
 * ```
 */
export function Can(props: CanProps): ReactNode {
  return useCan(toCheck<Permission>(props, 'do')) ? props.children : null
}

/** Renders its children when the current user does **not** hold the permission(s). */
export function Cannot(props: CanProps): ReactNode {
  return useCan(toCheck<Permission>(props, 'do')) ? null : props.children
}

/**
 * Renders its children when the current user holds the role(s).
 *
 * @example
 * ```ts
 * <HasRole is="admin"><AdminPanel /></HasRole>
 * <HasRole any={['editor', 'reviewer']}><ReviewQueue /></HasRole>
 * ```
 */
export function HasRole(props: RoleProps): ReactNode {
  return useRole(toCheck<RoleName>(props, 'is')) ? props.children : null
}

/** Renders its children when the current user holds **none** of the role(s). */
export function HasNoRole(props: RoleProps): ReactNode {
  return useRole(toCheck<RoleName>(props, 'is')) ? null : props.children
}
