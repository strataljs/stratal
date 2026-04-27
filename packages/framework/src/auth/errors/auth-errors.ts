import { ApplicationError, ERROR_CODES } from 'stratal/errors'

export class UserNotFoundError extends ApplicationError {
  constructor(email?: string) {
    super('auth.errors.userNotFound', ERROR_CODES.RESOURCE.NOT_FOUND, email ? { email } : undefined)
  }
}

export class InvalidCredentialsError extends ApplicationError {
  constructor() {
    super('auth.errors.invalidCredentials', ERROR_CODES.AUTH.INVALID_CREDENTIALS)
  }
}

export class InvalidPasswordError extends ApplicationError {
  constructor() {
    super('auth.errors.invalidPassword', ERROR_CODES.AUTH.INVALID_CREDENTIALS)
  }
}

export class InvalidEmailError extends ApplicationError {
  constructor(email?: string) {
    super('auth.errors.invalidEmail', ERROR_CODES.VALIDATION.INVALID_FORMAT, email ? { email } : undefined)
  }
}

export class SessionExpiredError extends ApplicationError {
  constructor() {
    super('auth.errors.sessionExpired', ERROR_CODES.AUTH.SESSION_EXPIRED)
  }
}

export class EmailNotVerifiedError extends ApplicationError {
  constructor(email?: string) {
    super('auth.errors.emailNotVerified', ERROR_CODES.AUTH.EMAIL_NOT_VERIFIED, email ? { email } : undefined)
  }
}

export class PasswordTooShortError extends ApplicationError {
  constructor(minLength: number) {
    super('auth.errors.passwordTooShort', ERROR_CODES.AUTH.PASSWORD_TOO_SHORT, { minLength })
  }
}

export class PasswordTooLongError extends ApplicationError {
  constructor(maxLength: number) {
    super('auth.errors.passwordTooLong', ERROR_CODES.AUTH.PASSWORD_TOO_LONG, { maxLength })
  }
}

export class AccountAlreadyExistsError extends ApplicationError {
  constructor(email?: string) {
    super('auth.errors.accountAlreadyExists', ERROR_CODES.AUTH.ACCOUNT_ALREADY_EXISTS, email ? { email } : undefined)
  }
}

export class FailedToCreateUserError extends ApplicationError {
  constructor(reason?: string) {
    super('auth.errors.failedToCreateUser', ERROR_CODES.AUTH.FAILED_TO_CREATE_USER, reason ? { reason } : undefined)
  }
}

export class FailedToCreateSessionError extends ApplicationError {
  constructor(reason?: string) {
    super('auth.errors.failedToCreateSession', ERROR_CODES.AUTH.FAILED_TO_CREATE_SESSION, reason ? { reason } : undefined)
  }
}

export class FailedToUpdateUserError extends ApplicationError {
  constructor(reason?: string) {
    super('auth.errors.failedToUpdateUser', ERROR_CODES.AUTH.FAILED_TO_UPDATE_USER, reason ? { reason } : undefined)
  }
}

export class SocialAccountLinkedError extends ApplicationError {
  constructor(provider?: string) {
    super('auth.errors.socialAccountLinked', ERROR_CODES.AUTH.SOCIAL_ACCOUNT_LINKED, provider ? { provider } : undefined)
  }
}

export class CannotUnlinkLastAccountError extends ApplicationError {
  constructor() {
    super('auth.errors.cannotUnlinkLastAccount', ERROR_CODES.AUTH.CANNOT_UNLINK_LAST_ACCOUNT)
  }
}

export class ProviderNotFoundError extends ApplicationError {
  constructor(provider?: string) {
    super('auth.errors.providerNotFound', ERROR_CODES.RESOURCE.NOT_FOUND, provider ? { provider } : undefined)
  }
}

export class UserEmailNotFoundError extends ApplicationError {
  constructor() {
    super('auth.errors.userEmailNotFound', ERROR_CODES.RESOURCE.NOT_FOUND)
  }
}

export class AccountNotFoundError extends ApplicationError {
  constructor() {
    super('auth.errors.accountNotFound', ERROR_CODES.RESOURCE.NOT_FOUND)
  }
}

export class CredentialAccountNotFoundError extends ApplicationError {
  constructor() {
    super('auth.errors.credentialAccountNotFound', ERROR_CODES.RESOURCE.NOT_FOUND)
  }
}

export class UserAlreadyHasPasswordError extends ApplicationError {
  constructor() {
    super('auth.errors.userAlreadyHasPassword', ERROR_CODES.RESOURCE.CONFLICT)
  }
}

export class EmailCannotBeUpdatedError extends ApplicationError {
  constructor(reason?: string) {
    super('auth.errors.emailCannotBeUpdated', ERROR_CODES.VALIDATION.GENERIC, reason ? { reason } : undefined)
  }
}

export class FailedToGetSessionError extends ApplicationError {
  constructor(reason?: string) {
    super('auth.errors.failedToGetSession', ERROR_CODES.SYSTEM.INTERNAL_ERROR, reason ? { reason } : undefined)
  }
}

export class FailedToGetUserInfoError extends ApplicationError {
  constructor(reason?: string) {
    super('auth.errors.failedToGetUserInfo', ERROR_CODES.SYSTEM.INTERNAL_ERROR, reason ? { reason } : undefined)
  }
}

export class IdTokenNotSupportedError extends ApplicationError {
  constructor() {
    super('auth.errors.invalidToken', ERROR_CODES.VALIDATION.GENERIC)
  }
}

export class TokenExpiredError extends ApplicationError {
  constructor() {
    super('auth.errors.tokenExpired', ERROR_CODES.VALIDATION.GENERIC)
  }
}

export class InvalidCallbackUrlError extends ApplicationError {
  constructor() {
    super('auth.errors.invalidCallbackUrl', ERROR_CODES.VALIDATION.INVALID_FORMAT)
  }
}

export class InvalidOriginError extends ApplicationError {
  constructor() {
    super('auth.errors.invalidOrigin', ERROR_CODES.AUTHZ.FORBIDDEN)
  }
}

export class AuthValidationFailedError extends ApplicationError {
  constructor() {
    super('auth.errors.validationFailed', ERROR_CODES.VALIDATION.GENERIC)
  }
}

export class EmailAlreadyVerifiedError extends ApplicationError {
  constructor() {
    super('auth.errors.emailAlreadyVerified', ERROR_CODES.RESOURCE.CONFLICT)
  }
}

export class EmailMismatchError extends ApplicationError {
  constructor() {
    super('auth.errors.emailMismatch', ERROR_CODES.VALIDATION.INVALID_FORMAT)
  }
}

export class BetterAuthUnknownError extends ApplicationError {
  constructor(errorCode?: string) {
    super('auth.errors.unknownError', ERROR_CODES.SYSTEM.INTERNAL_ERROR, errorCode ? { errorCode } : undefined)
  }
}
