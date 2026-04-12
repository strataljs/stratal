export const messages = {
  en: {
    errors: {
      auth: {
        invalidCallbackUrl: 'Invalid callback URL',
        invalidOrigin: 'Request origin is not allowed',
        validationFailed: 'Authentication validation failed',
        emailAlreadyVerified: 'Email address is already verified',
        emailMismatch: 'Email address does not match',
        unknownError: 'An authentication error occurred',

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
    },
  },
} as const

type I18n = typeof messages['en'];

declare module 'stratal/i18n' {
  interface AppMessages extends I18n {
  }
}
