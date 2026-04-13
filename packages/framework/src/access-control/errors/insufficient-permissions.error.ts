import { ApplicationError, ERROR_CODES } from 'stratal/errors'

/**
 * InsufficientPermissionsError
 *
 * Thrown when a user attempts to perform an action without the required permissions.
 * Used by AuthGuard after an authorization check fails.
 *
 * HTTP Status: 403 Forbidden
 */
export class InsufficientPermissionsError extends ApplicationError {
  constructor(requiredPermissions: string | string[], userId?: string) {
    const summary = Array.isArray(requiredPermissions)
      ? requiredPermissions.join(', ')
      : requiredPermissions
    super('errors.insufficientPermissions', ERROR_CODES.AUTHZ.INSUFFICIENT_PERMISSIONS, {
      requiredPermissions: summary,
      userId: userId ?? 'unknown',
    })
  }
}
