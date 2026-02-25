import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * ResendApiKeyMissingError
 *
 * Thrown when the Resend API key is not configured in environment variables.
 * This prevents the Resend email provider from initializing.
 *
 * Resolution: Set the RESEND_EMAIL_API_KEY environment variable.
 */
export class ResendApiKeyMissingError extends ApplicationError {
  constructor() {
    super(
      'errors.email.resendApiKeyMissing',
      ERROR_CODES.SYSTEM.CONFIGURATION_ERROR
    )
  }
}
