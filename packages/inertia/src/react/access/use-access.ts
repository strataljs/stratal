import type { PageProps } from '@inertiajs/core'
import { usePage } from '@inertiajs/react'
import type { Check, Permission, RoleName, SharedAccess } from '../../access/types'
import { evaluate, matchesPermission, matchesRole } from './match'
import { MissingAccessPropsError } from './missing-access-props.error'

interface AccessPageProps extends PageProps {
  access?: SharedAccess
}

/**
 * Returns the current user's roles and merged permissions.
 *
 * @throws {MissingAccessPropsError} when the page carries no `access` prop.
 */
export function useAccess(): SharedAccess {
  const access = usePage<AccessPageProps>().props.access
  if (!access) throw new MissingAccessPropsError()
  return access
}

/**
 * Whether the current user holds the given permission(s).
 *
 * @example
 * ```ts
 * const canEdit   = useCan('posts:update')
 * const canEither = useCan({ any: ['posts:update', 'posts:delete'] })
 * const canBoth   = useCan({ all: ['posts:read', 'admin:access'] })
 * ```
 */
export function useCan(check: Check<Permission>): boolean {
  return evaluate(useAccess(), check as Check<string>, matchesPermission)
}

/**
 * Whether the current user holds the given role(s).
 *
 * @example
 * ```ts
 * const isAdmin = useRole('admin')
 * const isStaff = useRole({ any: ['editor', 'reviewer'] })
 * ```
 */
export function useRole(check: Check<RoleName>): boolean {
  return evaluate(useAccess(), check as Check<string>, matchesRole)
}
