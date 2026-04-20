export const authMessages = {
  en: {
    errors: {
      tokenRequired: 'Verification token is required',
      invalidToken: 'Invalid or expired verification token',
      verificationFailed: 'Verification failed. Please try again.',
      userNotFound: 'User not found. Please check your credentials.',
      invalidCredentials: 'Invalid email or password',
      invalidPassword: 'Invalid password',
      invalidEmail: 'Invalid email address',
      sessionExpired: 'Your session has expired. Please sign in again.',
      emailNotVerified: 'Please verify your email address before signing in',
      passwordTooShort: 'Password must be at least {minLength} characters',
      passwordTooLong: 'Password must be at most {maxLength} characters',
      accountAlreadyExists: 'An account with this email already exists',
      failedToCreateUser: 'Failed to create user account. Please try again.',
      failedToCreateSession: 'Failed to create session. Please try again.',
      failedToGetSession: 'Failed to retrieve session. Please try again.',
      failedToUpdateUser: 'Failed to update user information. Please try again.',
      failedToGetUserInfo: 'Failed to retrieve user information. Please try again.',
      socialAccountLinked: 'This social account is already linked to another user',
      providerNotFound: 'Authentication provider not found',
      userEmailNotFound: 'User email address not found',
      accountNotFound: 'Account not found',
      credentialAccountNotFound: 'Credential account not found',
      cannotUnlinkLastAccount: 'Cannot unlink your last account',
      userAlreadyHasPassword: 'User already has a password set',
      emailCannotBeUpdated: 'Email address cannot be updated at this time',
      tokenExpired: 'The verification token has expired. Please request a new verification email.',
      invalidCallbackUrl: 'Invalid callback URL',
      invalidOrigin: 'Request origin is not allowed',
      validationFailed: 'Authentication validation failed',
      emailAlreadyVerified: 'Email address is already verified',
      emailMismatch: 'Email address does not match',
      unknownError: 'An authentication error occurred',
    },
    org: {
      organizationNotFound: 'Organization not found',
      memberNotFound: 'Member not found',
      invitationNotFound: 'Invitation not found',
      permissionDenied: 'You do not have permission to perform this action',
      invitationRecipientMismatch: 'You are not the recipient of this invitation',
      conflict: 'A resource with this identifier already exists',
      limitReached: 'The maximum limit has been reached',
      membershipError: 'This action cannot be performed due to membership constraints',
      teamNotFound: 'Team not found',
      roleNotFound: 'Role not found',
    },
  },
} as const

declare module 'stratal/i18n' {
  interface AppMessageNamespaces {
    auth: typeof authMessages['en']
  }
}
