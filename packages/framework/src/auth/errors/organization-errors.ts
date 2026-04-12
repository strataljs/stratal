import { ApplicationError, ERROR_CODES } from 'stratal/errors'

export class OrganizationNotFoundError extends ApplicationError {
  constructor() {
    super('errors.auth.org.organizationNotFound', ERROR_CODES.AUTH.ORGANIZATION_NOT_FOUND)
  }
}

export class OrganizationMemberNotFoundError extends ApplicationError {
  constructor() {
    super('errors.auth.org.memberNotFound', ERROR_CODES.AUTH.MEMBER_NOT_FOUND)
  }
}

export class OrganizationInvitationNotFoundError extends ApplicationError {
  constructor() {
    super('errors.auth.org.invitationNotFound', ERROR_CODES.AUTH.INVITATION_NOT_FOUND)
  }
}

export class OrganizationPermissionDeniedError extends ApplicationError {
  constructor() {
    super('errors.auth.org.permissionDenied', ERROR_CODES.AUTHZ.FORBIDDEN)
  }
}

export class OrganizationInvitationRecipientMismatchError extends ApplicationError {
  constructor() {
    super('errors.auth.org.invitationRecipientMismatch', ERROR_CODES.AUTH.INVITATION_RECIPIENT_MISMATCH)
  }
}

export class OrganizationConflictError extends ApplicationError {
  constructor() {
    super('errors.auth.org.conflict', ERROR_CODES.RESOURCE.CONFLICT)
  }
}

export class OrganizationLimitReachedError extends ApplicationError {
  constructor() {
    super('errors.auth.org.limitReached', ERROR_CODES.AUTH.ORGANIZATION_LIMIT_REACHED)
  }
}

export class OrganizationMembershipError extends ApplicationError {
  constructor() {
    super('errors.auth.org.membershipError', ERROR_CODES.AUTH.ORGANIZATION_MEMBERSHIP_REQUIRED)
  }
}

export class OrganizationTeamNotFoundError extends ApplicationError {
  constructor() {
    super('errors.auth.org.teamNotFound', ERROR_CODES.RESOURCE.NOT_FOUND)
  }
}

export class OrganizationRoleNotFoundError extends ApplicationError {
  constructor() {
    super('errors.auth.org.roleNotFound', ERROR_CODES.RESOURCE.NOT_FOUND)
  }
}
