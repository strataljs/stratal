import { ApplicationError, ERROR_CODES } from 'stratal/errors'

export class UserNotFoundError extends ApplicationError {
  constructor(email?: string) {
    super('errors.auth.userNotFound', ERROR_CODES.RESOURCE.NOT_FOUND, email ? { email } : undefined)
  }
}

export class InvalidCredentialsError extends ApplicationError {
  constructor() {
    super('errors.auth.invalidCredentials', ERROR_CODES.AUTH.INVALID_CREDENTIALS)
  }
}

export class InvalidPasswordError extends ApplicationError {
  constructor() {
    super('errors.auth.invalidPassword', ERROR_CODES.AUTH.INVALID_CREDENTIALS)
  }
}

export class InvalidEmailError extends ApplicationError {
  constructor(email?: string) {
    super('errors.auth.invalidEmail', ERROR_CODES.VALIDATION.INVALID_FORMAT, email ? { email } : undefined)
  }
}

export class SessionExpiredError extends ApplicationError {
  constructor() {
    super('errors.auth.sessionExpired', ERROR_CODES.AUTH.SESSION_EXPIRED)
  }
}

export class EmailNotVerifiedError extends ApplicationError {
  constructor(email?: string) {
    super('errors.auth.emailNotVerified', ERROR_CODES.AUTH.EMAIL_NOT_VERIFIED, email ? { email } : undefined)
  }
}

export class PasswordTooShortError extends ApplicationError {
  constructor(minLength: number) {
    super('errors.auth.passwordTooShort', ERROR_CODES.AUTH.PASSWORD_TOO_SHORT, { minLength })
  }
}

export class PasswordTooLongError extends ApplicationError {
  constructor(maxLength: number) {
    super('errors.auth.passwordTooLong', ERROR_CODES.AUTH.PASSWORD_TOO_LONG, { maxLength })
  }
}

export class AccountAlreadyExistsError extends ApplicationError {
  constructor(email?: string) {
    super('errors.auth.accountAlreadyExists', ERROR_CODES.AUTH.ACCOUNT_ALREADY_EXISTS, email ? { email } : undefined)
  }
}

export class FailedToCreateUserError extends ApplicationError {
  constructor(reason?: string) {
    super('errors.auth.failedToCreateUser', ERROR_CODES.AUTH.FAILED_TO_CREATE_USER, reason ? { reason } : undefined)
  }
}

export class FailedToCreateSessionError extends ApplicationError {
  constructor(reason?: string) {
    super('errors.auth.failedToCreateSession', ERROR_CODES.AUTH.FAILED_TO_CREATE_SESSION, reason ? { reason } : undefined)
  }
}

export class FailedToUpdateUserError extends ApplicationError {
  constructor(reason?: string) {
    super('errors.auth.failedToUpdateUser', ERROR_CODES.AUTH.FAILED_TO_UPDATE_USER, reason ? { reason } : undefined)
  }
}

export class SocialAccountLinkedError extends ApplicationError {
  constructor(provider?: string) {
    super('errors.auth.socialAccountLinked', ERROR_CODES.AUTH.SOCIAL_ACCOUNT_LINKED, provider ? { provider } : undefined)
  }
}

export class CannotUnlinkLastAccountError extends ApplicationError {
  constructor() {
    super('errors.auth.cannotUnlinkLastAccount', ERROR_CODES.AUTH.CANNOT_UNLINK_LAST_ACCOUNT)
  }
}

export class ProviderNotFoundError extends ApplicationError {
  constructor(provider?: string) {
    super('errors.auth.providerNotFound', ERROR_CODES.RESOURCE.NOT_FOUND, provider ? { provider } : undefined)
  }
}

export class UserEmailNotFoundError extends ApplicationError {
  constructor() {
    super('errors.auth.userEmailNotFound', ERROR_CODES.RESOURCE.NOT_FOUND)
  }
}

export class AccountNotFoundError extends ApplicationError {
  constructor() {
    super('errors.auth.accountNotFound', ERROR_CODES.RESOURCE.NOT_FOUND)
  }
}

export class CredentialAccountNotFoundError extends ApplicationError {
  constructor() {
    super('errors.auth.credentialAccountNotFound', ERROR_CODES.RESOURCE.NOT_FOUND)
  }
}

export class UserAlreadyHasPasswordError extends ApplicationError {
  constructor() {
    super('errors.auth.userAlreadyHasPassword', ERROR_CODES.RESOURCE.CONFLICT)
  }
}

export class EmailCannotBeUpdatedError extends ApplicationError {
  constructor(reason?: string) {
    super('errors.auth.emailCannotBeUpdated', ERROR_CODES.VALIDATION.GENERIC, reason ? { reason } : undefined)
  }
}

export class FailedToGetSessionError extends ApplicationError {
  constructor(reason?: string) {
    super('errors.auth.failedToGetSession', ERROR_CODES.SYSTEM.INTERNAL_ERROR, reason ? { reason } : undefined)
  }
}

export class FailedToGetUserInfoError extends ApplicationError {
  constructor(reason?: string) {
    super('errors.auth.failedToGetUserInfo', ERROR_CODES.SYSTEM.INTERNAL_ERROR, reason ? { reason } : undefined)
  }
}

export class IdTokenNotSupportedError extends ApplicationError {
  constructor() {
    super('errors.auth.invalidToken', ERROR_CODES.VALIDATION.GENERIC)
  }
}

export class TokenExpiredError extends ApplicationError {
  constructor() {
    super('errors.auth.tokenExpired', ERROR_CODES.VALIDATION.GENERIC)
  }
}
