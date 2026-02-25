import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * EmailSmtpConnectionFailedError
 *
 * Thrown when connection to SMTP server fails during email sending.
 * This is a runtime error that may be temporary.
 *
 * Resolution: Check SMTP server availability, network connectivity, or wait and retry.
 */
export class EmailSmtpConnectionFailedError extends ApplicationError {
  constructor(smtpHost: string, smtpPort: number) {
    super(
      'errors.email.smtpConnectionFailed',
      ERROR_CODES.SYSTEM.INFRASTRUCTURE_ERROR,
      { smtpHost, smtpPort }
    )
  }
}
