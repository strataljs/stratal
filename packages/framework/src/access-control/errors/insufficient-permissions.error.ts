import { HttpException } from 'stratal/errors'

export class InsufficientPermissionsError extends HttpException {
  public readonly requiredPermissions: string
  public readonly userId?: string

  constructor(requiredPermissions: string | string[], userId?: string) {
    const summary = Array.isArray(requiredPermissions) ? requiredPermissions.join(', ') : requiredPermissions
    super(403, 'Insufficient permissions')
    this.requiredPermissions = summary
    this.userId = userId
  }
}
