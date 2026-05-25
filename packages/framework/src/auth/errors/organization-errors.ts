import { HttpException } from 'stratal/errors'

export class OrganizationNotFoundError extends HttpException {
  constructor() { super(404, 'Organization not found') }
}
export class OrganizationMemberNotFoundError extends HttpException {
  constructor() { super(404, 'Organization member not found') }
}
export class OrganizationInvitationNotFoundError extends HttpException {
  constructor() { super(404, 'Invitation not found') }
}
export class OrganizationPermissionDeniedError extends HttpException {
  constructor() { super(403, 'Organization permission denied') }
}
export class OrganizationInvitationRecipientMismatchError extends HttpException {
  constructor() { super(403, 'Invitation recipient mismatch') }
}
export class OrganizationConflictError extends HttpException {
  constructor() { super(409, 'Organization resource conflict') }
}
export class OrganizationLimitReachedError extends HttpException {
  constructor() { super(422, 'Organization limit reached') }
}
export class OrganizationMembershipError extends HttpException {
  constructor() { super(422, 'Organization membership constraint violated') }
}
export class OrganizationTeamNotFoundError extends HttpException {
  constructor() { super(404, 'Team not found') }
}
export class OrganizationRoleNotFoundError extends HttpException {
  constructor() { super(404, 'Role not found') }
}
