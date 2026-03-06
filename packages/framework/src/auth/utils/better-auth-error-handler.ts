import { type BASE_ERROR_CODES } from '@better-auth/core/error'
import { APIError } from 'better-auth/api'
import type { ApplicationError } from 'stratal/errors'
import { InternalError } from 'stratal/errors'
import {
  AccountAlreadyExistsError,
  AccountNotFoundError,
  CannotUnlinkLastAccountError,
  CredentialAccountNotFoundError,
  EmailCannotBeUpdatedError,
  EmailNotVerifiedError,
  FailedToCreateSessionError,
  FailedToCreateUserError,
  FailedToGetSessionError,
  FailedToGetUserInfoError,
  FailedToUpdateUserError,
  IdTokenNotSupportedError,
  InvalidCredentialsError,
  InvalidEmailError,
  InvalidPasswordError,
  InvalidTokenError,
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
  const errorCode = error.body?.code as keyof typeof BASE_ERROR_CODES | 'TOKEN_EXPIRED' | undefined

  if (error.status === 'FOUND') {
    const headers = error.headers as Headers
    const hasInvalidToken = headers.get('location')?.includes('INVALID_TOKEN')

    if (hasInvalidToken) {
      return new InvalidTokenError()
    }
  }

  if (!errorCode) {
    return new InternalError({
      originalError: `Better Auth error: ${error.message}`,
      stack: error.stack,
    })
  }

  // User errors
  if (errorCode === 'USER_NOT_FOUND') return new UserNotFoundError()
  if (errorCode === 'USER_EMAIL_NOT_FOUND') return new UserEmailNotFoundError()

  // Credential errors
  if (errorCode === 'INVALID_EMAIL_OR_PASSWORD') return new InvalidCredentialsError()
  if (errorCode === 'INVALID_PASSWORD') return new InvalidPasswordError()
  if (errorCode === 'INVALID_EMAIL') return new InvalidEmailError()

  // Session errors
  if (errorCode === 'SESSION_EXPIRED') return new SessionExpiredError()
  if (errorCode === 'FAILED_TO_CREATE_SESSION') return new FailedToCreateSessionError()
  if (errorCode === 'FAILED_TO_GET_SESSION') return new FailedToGetSessionError()

  // Email verification
  if (errorCode === 'EMAIL_NOT_VERIFIED') return new EmailNotVerifiedError()
  if (errorCode === 'EMAIL_CAN_NOT_BE_UPDATED') return new EmailCannotBeUpdatedError()

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
  if (errorCode === 'FAILED_TO_CREATE_USER') return new FailedToCreateUserError()
  if (errorCode === 'FAILED_TO_UPDATE_USER') return new FailedToUpdateUserError()
  if (errorCode === 'FAILED_TO_GET_USER_INFO') return new FailedToGetUserInfoError()

  // Social account errors
  if (errorCode === 'SOCIAL_ACCOUNT_ALREADY_LINKED') return new SocialAccountLinkedError()
  if (errorCode === 'PROVIDER_NOT_FOUND') return new ProviderNotFoundError()

  // Token errors
  if (errorCode === 'ID_TOKEN_NOT_SUPPORTED') return new IdTokenNotSupportedError()
  if (errorCode === 'INVALID_TOKEN') return new IdTokenNotSupportedError()
  if (errorCode === 'TOKEN_EXPIRED') return new TokenExpiredError()

  // Password management
  if (errorCode === 'USER_ALREADY_HAS_PASSWORD') return new UserAlreadyHasPasswordError()

  // Unknown error code
  return new InternalError({
    originalError: `Better Auth error [${errorCode}]: ${error.message}`,
    stack: error.stack,
  })
}

/**
 * Type guard to check if an error is a Better Auth APIError
 */
export function isAPIError(error: unknown): error is APIError {
  return error instanceof APIError
}
