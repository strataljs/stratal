import type { BaseUser } from '@better-auth/core/db'
import { Transient, DI_TOKENS } from 'stratal/di'
import {
  ContextNotInitializedError,
  UserNotAuthenticatedError
} from './errors'

/**
 * Authenticated user shape stored in {@link AuthContext}.
 *
 * Inherits Better Auth's base user fields, with `name` made optional so apps
 * that store `firstName`/`lastName` (or other name conventions) instead of
 * `name` aren't forced to declare a phantom value.
 *
 * Augment via TypeScript module declaration to add app-specific fields. Match
 * the augmentation to whatever your Better Auth `user.additionalFields` /
 * plugins are configured to return:
 *
 * @example
 * ```ts
 * declare module '@stratal/framework/context' {
 *   interface AuthUser {
 *     firstName: string
 *     lastName: string
 *     role: string
 *   }
 * }
 * ```
 */
export interface AuthUser extends Omit<BaseUser, 'name'> {
  name?: string
}

export interface AuthInfo {
  user: AuthUser
}

@Transient(DI_TOKENS.AuthContext)
export class AuthContext {
  protected user?: AuthUser

  /**
   * Set authentication context.
   * This should be called once per request with the authenticated user.
   */
  setAuthContext(info: AuthInfo): void {
    this.user = info.user
  }

  /**
   * Get the authenticated user if available.
   * Returns undefined if no user is authenticated.
   */
  getUser(): AuthUser | undefined {
    return this.user
  }

  /**
   * Get the authenticated user or throw if not authenticated.
   */
  requireUser(): AuthUser {
    if (!this.user) {
      throw new UserNotAuthenticatedError()
    }
    return this.user
  }

  /**
   * Get user ID if available.
   * Returns undefined if no user is authenticated.
   */
  getUserId(): string | undefined {
    return this.user?.id
  }

  /**
   * Get user ID or throw if not authenticated.
   * Use this when authentication is required.
   */
  requireUserId(): string {
    return this.requireUser().id
  }

  /**
   * Get full authentication context or throw if not initialized.
   */
  getAuthInfo(): AuthInfo {
    if (!this.user) {
      throw new ContextNotInitializedError('Authentication')
    }
    return { user: this.user }
  }

  /**
   * Get the raw role string from the authenticated user.
   *
   * Reads from `user.role` — apps that use roles should augment {@link AuthUser}
   * with `role: string` (or similar) so this returns a typed value.
   */
  getRole(): string | undefined {
    return (this.user as { role?: string } | undefined)?.role
  }

  /**
   * Get the user's roles as an array.
   * Returns an empty array if no role is set or user is not authenticated.
   */
  getRoles(): string[] {
    const role = this.getRole()
    if (!role) return []
    return role.split(',').map(r => r.trim()).filter(Boolean)
  }

  /**
   * Check if user is authenticated.
   */
  isAuthenticated(): boolean {
    return !!this.user
  }

  /**
   * Clear authentication context.
   * Useful for testing or cleanup.
   */
  clearAuthContext(): void {
    this.user = undefined
  }
}
