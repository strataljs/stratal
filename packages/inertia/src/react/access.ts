/**
 * Client-side access control for Stratal Inertia apps.
 *
 * Gate rendering on the current user's roles and permissions, shared
 * automatically by `@stratal/framework` once `accessControl` is configured on
 * `AuthModule.forRootAsync()`. Permission strings and role names are checked
 * against the generated `AccessControlRegistry`.
 *
 * Published as its own entry rather than on `@stratal/inertia/react` so that
 * importing a gate doesn't pull the i18n runtime into your bundle.
 *
 * @example
 * ```ts
 * import { Can, HasRole, useCan } from '@stratal/inertia/react/access'
 * ```
 *
 * @packageDocumentation
 */

export { Can, Cannot, HasNoRole, HasRole } from './access/components'
export type { CanProps, RoleProps } from './access/components'
export { MissingAccessPropsError } from './access/missing-access-props.error'
export { useAccess, useCan, useRole } from './access/use-access'
export type { AccessControlRegistry, Check, Permission, RoleName, SharedAccess } from '../access/types'
