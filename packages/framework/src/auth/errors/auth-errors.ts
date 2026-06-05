import { HttpException } from 'stratal/errors'

export class UserNotFoundError extends HttpException {
  constructor(public readonly email?: string) {
    super(404, 'User not found')
  }
}

export class InvalidCredentialsError extends HttpException {
  constructor() { super(401, 'Invalid email or password') }
}

export class InvalidPasswordError extends HttpException {
  constructor() { super(401, 'Invalid password') }
}

export class InvalidEmailError extends HttpException {
  constructor(public readonly email?: string) {
    super(422, 'Invalid email address')
  }
}

export class SessionExpiredError extends HttpException {
  constructor() { super(401, 'Session expired') }
}

export class EmailNotVerifiedError extends HttpException {
  constructor(public readonly email?: string) {
    super(403, 'Email not verified')
  }
}

export class PasswordTooShortError extends HttpException {
  constructor(public readonly minLength?: number) {
    super(422, 'Password too short')
  }
}

export class PasswordTooLongError extends HttpException {
  constructor(public readonly maxLength?: number) {
    super(422, 'Password too long')
  }
}

export class AccountAlreadyExistsError extends HttpException {
  constructor(public readonly email?: string) {
    super(409, 'Account already exists')
  }
}

export class SocialAccountLinkedError extends HttpException {
  constructor(public readonly provider?: string) {
    super(409, 'Social account already linked')
  }
}

export class CannotUnlinkLastAccountError extends HttpException {
  constructor() { super(409, 'Cannot unlink last account') }
}

export class ProviderNotFoundError extends HttpException {
  constructor(public readonly provider?: string) {
    super(404, 'Authentication provider not found')
  }
}

export class UserEmailNotFoundError extends HttpException {
  constructor() { super(404, 'User email not found') }
}

export class AccountNotFoundError extends HttpException {
  constructor() { super(404, 'Account not found') }
}

export class CredentialAccountNotFoundError extends HttpException {
  constructor() { super(404, 'Credential account not found') }
}

export class UserAlreadyHasPasswordError extends HttpException {
  constructor() { super(409, 'User already has a password') }
}

export class EmailCannotBeUpdatedError extends HttpException {
  constructor(public readonly reason?: string) {
    super(422, 'Email cannot be updated')
  }
}

export class IdTokenNotSupportedError extends HttpException {
  constructor() { super(422, 'ID token not supported') }
}

export class TokenExpiredError extends HttpException {
  constructor() { super(401, 'Token expired') }
}

export class InvalidCallbackUrlError extends HttpException {
  constructor() { super(422, 'Invalid callback URL') }
}

export class InvalidOriginError extends HttpException {
  constructor() { super(403, 'Invalid request origin') }
}

export class AuthValidationFailedError extends HttpException {
  constructor() { super(422, 'Authentication validation failed') }
}

export class EmailAlreadyVerifiedError extends HttpException {
  constructor() { super(409, 'Email already verified') }
}

export class EmailMismatchError extends HttpException {
  constructor() { super(422, 'Email mismatch') }
}
