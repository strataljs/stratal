import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * SmtpHostMissingError
 *
 * Thrown when SMTP host could not be parsed from SMTP_URL or is empty.
 * This prevents the SMTP email provider from initializing.
 *
 * Resolution: Ensure SMTP_URL is correctly formatted: smtp://user:pass@host:port
 */
export class SmtpHostMissingError extends ApplicationError {
  constructor() {
    super(
      'errors.email.smtpHostMissing',
      ERROR_CODES.SYSTEM.CONFIGURATION_ERROR
    )
  }
}
