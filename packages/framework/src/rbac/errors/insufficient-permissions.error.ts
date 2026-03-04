import { ApplicationError, ERROR_CODES } from 'stratal/errors'

/**
 * InsufficientPermissionsError
 *
 * Thrown when a user attempts to perform an action without the required permissions.
 * This error is used by the auth guard after authorization check fails.
 *
 * HTTP Status: 403 Forbidden
 * Error Code: 3102 (AUTHZ.INSUFFICIENT_PERMISSIONS)
 */
export class InsufficientPermissionsError extends ApplicationError {
  constructor(requiredScopes: string[], userId?: string) {
    super('errors.insufficientPermissions', ERROR_CODES.AUTHZ.INSUFFICIENT_PERMISSIONS, {
      requiredScopes: requiredScopes.join(', '),
      userId: userId ?? 'unknown',
    })
  }
}
