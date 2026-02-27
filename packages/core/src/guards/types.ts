import type { RouterContext } from '../router'
import type { Constructor } from '../types'

/**
 * Interface for guards that control access to routes
 *
 * Guards are executed after middlewares but before route handlers.
 * They determine if a request should be allowed to proceed.
 *
 * @example
 * ```typescript
 * class RoleGuard implements CanActivate {
 *   constructor(private readonly role: string) {}
 *
 *   async canActivate(context: RouterContext): Promise<boolean> {
 *     const user = context.getUser()
 *     return user?.roles.includes(this.role) ?? false
 *   }
 * }
 * ```
 */
export interface CanActivate {
  /**
   * Determine if the request should be allowed
   *
   * @param context - Router context with request/response helpers
   * @returns true to allow, false to deny (throws 403)
   */
  canActivate(context: RouterContext): boolean | Promise<boolean>
}

/**
 * Type for guard class constructors
 */
export type GuardClass = Constructor<CanActivate>

/**
 * Guard can be a class constructor or an instance
 * Instances are used for factory-created guards with configuration
 */
export type Guard = GuardClass | CanActivate

/**
 * Options for AuthGuard factory
 */
export interface AuthGuardOptions {
  /**
   * Required permissions (scopes) for authorization
   * If provided, permission check is performed after authentication.
   * If omitted, only authentication is required.
   */
  scopes?: string[]
}

/**
 * Metadata stored by `@UseGuards` decorator
 */
export interface GuardMetadata {
  guards: Guard[]
}

/**
 * Metadata key for guard storage
 */
export const GUARD_METADATA_KEY = Symbol('guards')
