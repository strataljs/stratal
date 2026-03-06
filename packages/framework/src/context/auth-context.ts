import { Transient, DI_TOKENS } from 'stratal/di'
import {
  ContextNotInitializedError,
  UserNotAuthenticatedError
} from './errors'

export interface AuthInfo {
  userId?: string
}

@Transient(DI_TOKENS.AuthContext)
export class AuthContext {
  protected userId?: string

  /**
   * Set authentication context.
   * This should be called once per request with user information.
   */
  setAuthContext(info: AuthInfo): void {
    this.userId = info.userId
  }

  /**
   * Get user ID if available.
   * Returns undefined if no user is authenticated.
   */
  getUserId(): string | undefined {
    return this.userId
  }

  /**
   * Get user ID or throw if not authenticated.
   * Use this when authentication is required.
   */
  requireUserId(): string {
    const userId = this.getUserId()
    if (!userId) {
      throw new UserNotAuthenticatedError()
    }
    return userId
  }

  /**
   * Get full authentication context or throw if not initialized.
   */
  getAuthContext(): AuthInfo {
    if (!this.userId) {
      throw new ContextNotInitializedError('Authentication')
    }
    return {
      userId: this.userId
    }
  }

  /**
   * Check if user is authenticated.
   */
  isAuthenticated(): boolean {
    return !!this.userId
  }

  /**
   * Clear authentication context.
   * Useful for testing or cleanup.
   */
  clearAuthContext(): void {
    this.userId = undefined
  }
}
