import { APIError } from 'better-auth/api'
import { AuthError } from 'stratal/errors'
import type { ApplicationError } from 'stratal/errors'
import {
  AccountAlreadyExistsError,
  AccountNotFoundError,
  AuthValidationFailedError,
  CannotUnlinkLastAccountError,
  CredentialAccountNotFoundError,
  EmailAlreadyVerifiedError,
  EmailCannotBeUpdatedError,
  EmailMismatchError,
  EmailNotVerifiedError,
  IdTokenNotSupportedError,
  InvalidCallbackUrlError,
  InvalidCredentialsError,
  InvalidEmailError,
  InvalidOriginError,
  InvalidPasswordError,
  InvalidTokenError,
  OrganizationConflictError,
  OrganizationInvitationNotFoundError,
  OrganizationInvitationRecipientMismatchError,
  OrganizationLimitReachedError,
  OrganizationMemberNotFoundError,
  OrganizationMembershipError,
  OrganizationNotFoundError,
  OrganizationPermissionDeniedError,
  OrganizationRoleNotFoundError,
  OrganizationTeamNotFoundError,
  PasswordTooLongError,
  PasswordTooShortError,
  ProviderNotFoundError,
  SessionExpiredError,
  SocialAccountLinkedError,
  TokenExpiredError,
  UserAlreadyHasPasswordError,
  UserEmailNotFoundError,
  UserNotFoundError,
} from '../errors'

/**
 * Maps Better Auth API error codes to ApplicationError instances.
 */
export function mapBetterAuthError(error: APIError): ApplicationError {
  const errorCode = error.body?.code

  if (error.status === 'FOUND') {
    const headers = error.headers as Headers
    const location = headers.get('location') ?? ''

    if (location.includes('INVALID_TOKEN')) return new InvalidTokenError()
    if (location.includes('EXPIRED_TOKEN')) return new TokenExpiredError()
    if (location.includes('ATTEMPTS_EXCEEDED')) return new InvalidTokenError()
    if (location.includes('new_user_signup_disabled')) return new UserNotFoundError()
    if (location.includes('failed_to_create_user')) return new AuthError('Failed to create user')
    if (location.includes('failed_to_create_session')) return new AuthError('Failed to create session')
  }

  if (!errorCode) {
    return new AuthError('An authentication error occurred')
  }

  // ── Base Error Codes ──────────────────────────────────────────────────

  // User errors
  if (errorCode === 'USER_NOT_FOUND' || errorCode === 'INVALID_USER') return new UserNotFoundError()
  if (errorCode === 'USER_EMAIL_NOT_FOUND') return new UserEmailNotFoundError()

  // Credential errors
  if (errorCode === 'INVALID_EMAIL_OR_PASSWORD') return new InvalidCredentialsError()
  if (errorCode === 'INVALID_PASSWORD') return new InvalidPasswordError()
  if (errorCode === 'INVALID_EMAIL') return new InvalidEmailError()

  // Session errors
  if (errorCode === 'SESSION_EXPIRED' || errorCode === 'SESSION_NOT_FRESH') return new SessionExpiredError()
  if (errorCode === 'FAILED_TO_CREATE_SESSION') return new AuthError('Failed to create session')
  if (errorCode === 'FAILED_TO_GET_SESSION') return new AuthError('Failed to retrieve session')

  // Email verification
  if (errorCode === 'EMAIL_NOT_VERIFIED') return new EmailNotVerifiedError()
  if (errorCode === 'EMAIL_CAN_NOT_BE_UPDATED') return new EmailCannotBeUpdatedError()
  if (errorCode === 'EMAIL_ALREADY_VERIFIED') return new EmailAlreadyVerifiedError()
  if (errorCode === 'EMAIL_MISMATCH') return new EmailMismatchError()

  // Password validation
  if (errorCode === 'PASSWORD_TOO_SHORT') return new PasswordTooShortError(8)
  if (errorCode === 'PASSWORD_TOO_LONG') return new PasswordTooLongError(128)

  // Account errors
  if (errorCode === 'USER_ALREADY_EXISTS' || errorCode === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
    return new AccountAlreadyExistsError()
  }
  if (errorCode === 'ACCOUNT_NOT_FOUND') return new AccountNotFoundError()
  if (errorCode === 'CREDENTIAL_ACCOUNT_NOT_FOUND') return new CredentialAccountNotFoundError()
  if (errorCode === 'FAILED_TO_UNLINK_LAST_ACCOUNT') return new CannotUnlinkLastAccountError()

  // User creation/update errors
  if (errorCode === 'FAILED_TO_CREATE_USER') return new AuthError('Failed to create user')
  if (errorCode === 'FAILED_TO_UPDATE_USER') return new AuthError('Failed to update user')
  if (errorCode === 'FAILED_TO_GET_USER_INFO') return new AuthError('Failed to retrieve user info')

  // Social account errors
  if (errorCode === 'SOCIAL_ACCOUNT_ALREADY_LINKED' || errorCode === 'LINKED_ACCOUNT_ALREADY_EXISTS') {
    return new SocialAccountLinkedError()
  }
  if (errorCode === 'PROVIDER_NOT_FOUND') return new ProviderNotFoundError()

  // Token errors
  if (errorCode === 'ID_TOKEN_NOT_SUPPORTED') return new IdTokenNotSupportedError()
  if (errorCode === 'INVALID_TOKEN') return new InvalidTokenError()
  if (errorCode === 'TOKEN_EXPIRED') return new TokenExpiredError()

  // Password management
  if (errorCode === 'USER_ALREADY_HAS_PASSWORD' || errorCode === 'PASSWORD_ALREADY_SET') {
    return new UserAlreadyHasPasswordError()
  }

  // Callback/redirect URL errors
  if (
    errorCode === 'INVALID_CALLBACK_URL'
    || errorCode === 'INVALID_REDIRECT_URL'
    || errorCode === 'INVALID_NEW_USER_CALLBACK_URL'
    || errorCode === 'INVALID_ERROR_CALLBACK_URL'
    || errorCode === 'CALLBACK_URL_REQUIRED'
  ) {
    return new InvalidCallbackUrlError()
  }

  // Origin/CORS errors
  if (
    errorCode === 'INVALID_ORIGIN'
    || errorCode === 'MISSING_OR_NULL_ORIGIN'
    || errorCode === 'CROSS_SITE_NAVIGATION_LOGIN_BLOCKED'
  ) {
    return new InvalidOriginError()
  }

  // Validation errors
  if (
    errorCode === 'VALIDATION_ERROR'
    || errorCode === 'MISSING_FIELD'
    || errorCode === 'FIELD_NOT_ALLOWED'
    || errorCode === 'BODY_MUST_BE_AN_OBJECT'
    || errorCode === 'ASYNC_VALIDATION_NOT_SUPPORTED'
    || errorCode === 'METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED'
  ) {
    return new AuthValidationFailedError()
  }

  // Verification errors
  if (errorCode === 'FAILED_TO_CREATE_VERIFICATION' || errorCode === 'VERIFICATION_EMAIL_NOT_ENABLED') {
    return new AuthError('Failed to create session')
  }

  // ── Organization Plugin Error Codes ───────────────────────────────────

  // Organization not found
  if (errorCode === 'ORGANIZATION_NOT_FOUND' || errorCode === 'NO_ACTIVE_ORGANIZATION') {
    return new OrganizationNotFoundError()
  }

  // Member not found
  if (
    errorCode === 'MEMBER_NOT_FOUND'
    || errorCode === 'USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION'
    || errorCode === 'USER_IS_NOT_A_MEMBER_OF_THE_TEAM'
  ) {
    return new OrganizationMemberNotFoundError()
  }

  // Invitation not found
  if (errorCode === 'INVITATION_NOT_FOUND' || errorCode === 'FAILED_TO_RETRIEVE_INVITATION') {
    return new OrganizationInvitationNotFoundError()
  }

  // Invitation recipient mismatch
  if (
    errorCode === 'YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION'
    || errorCode === 'EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION'
  ) {
    return new OrganizationInvitationRecipientMismatchError()
  }

  // Team not found
  if (errorCode === 'TEAM_NOT_FOUND' || errorCode === 'YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM') {
    return new OrganizationTeamNotFoundError()
  }

  // Role not found
  if (errorCode === 'ROLE_NOT_FOUND' || errorCode === 'INVALID_RESOURCE') {
    return new OrganizationRoleNotFoundError()
  }

  // Organization conflict/already exists
  if (
    errorCode === 'ORGANIZATION_ALREADY_EXISTS'
    || errorCode === 'ORGANIZATION_SLUG_ALREADY_TAKEN'
    || errorCode === 'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION'
    || errorCode === 'USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION'
    || errorCode === 'TEAM_ALREADY_EXISTS'
    || errorCode === 'ROLE_NAME_IS_ALREADY_TAKEN'
  ) {
    return new OrganizationConflictError()
  }

  // Organization limit reached
  if (
    errorCode === 'YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS'
    || errorCode === 'YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS'
    || errorCode === 'ORGANIZATION_MEMBERSHIP_LIMIT_REACHED'
    || errorCode === 'INVITATION_LIMIT_REACHED'
    || errorCode === 'TEAM_MEMBER_LIMIT_REACHED'
    || errorCode === 'TOO_MANY_ROLES'
  ) {
    return new OrganizationLimitReachedError()
  }

  // Organization membership constraints
  if (
    errorCode === 'YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER'
    || errorCode === 'YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER'
    || errorCode === 'UNABLE_TO_REMOVE_LAST_TEAM'
    || errorCode === 'CANNOT_DELETE_A_PRE_DEFINED_ROLE'
    || errorCode === 'ROLE_IS_ASSIGNED_TO_MEMBERS'
    || errorCode === 'YOU_CANNOT_IMPERSONATE_ADMINS'
    || errorCode === 'YOU_CANNOT_BAN_YOURSELF'
    || errorCode === 'YOU_CANNOT_REMOVE_YOURSELF'
    || errorCode === 'INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION'
  ) {
    return new OrganizationMembershipError()
  }

  // Organization permission denied (catch-all for YOU_ARE_NOT_ALLOWED_TO_* patterns)
  if (
    errorCode.startsWith('YOU_ARE_NOT_ALLOWED_TO_')
    || errorCode === 'YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION'
    || errorCode === 'YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM'
    || errorCode === 'YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE'
    || errorCode === 'MISSING_AC_INSTANCE'
  ) {
    return new OrganizationPermissionDeniedError()
  }

  // Unknown error code
  return new AuthError('An authentication error occurred')
}

/**
 * Type guard to check if an error is a Better Auth APIError.
 * Uses duck typing to handle bundler environments (e.g. Vite)
 * where instanceof may fail across module boundaries.
 */
export function isAPIError(error: unknown): error is APIError {
  if (error instanceof APIError) return true

  return (
    error instanceof Error
    && error.name === 'APIError'
    && 'status' in error
    && 'statusCode' in error
  )
}
