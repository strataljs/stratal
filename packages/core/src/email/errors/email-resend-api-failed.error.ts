import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * EmailResendApiFailedError
 *
 * Thrown when Resend API returns an error during email sending.
 * This is a runtime error from the Resend service.
 *
 * Resolution: Check Resend API status, API key validity, or wait and retry.
 */
export class EmailResendApiFailedError extends ApplicationError {
  constructor() {
    super(
      'errors.email.resendApiFailed',
      ERROR_CODES.SYSTEM.INFRASTRUCTURE_ERROR,
    )
  }
}
