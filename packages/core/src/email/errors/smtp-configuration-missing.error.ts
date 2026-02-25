import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * SmtpConfigurationMissingError
 *
 * Thrown when SMTP configuration is not found in environment variables.
 * This prevents the SMTP email provider from initializing.
 *
 * Resolution: Set the SMTP_URL environment variable with format: smtp://user:pass@host:port
 */
export class SmtpConfigurationMissingError extends ApplicationError {
  constructor() {
    super(
      'errors.email.smtpConfigurationMissing',
      ERROR_CODES.SYSTEM.CONFIGURATION_ERROR
    )
  }
}
