import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * EmailProviderNotSupportedError
 *
 * Thrown when an unsupported email provider is configured.
 * Only 'resend' and 'smtp' providers are currently supported.
 *
 * Resolution: Set EMAIL_PROVIDER to either 'resend' or 'smtp'.
 */
export class EmailProviderNotSupportedError extends ApplicationError {
  constructor(provider: string) {
    super(
      'errors.email.providerNotSupported',
      ERROR_CODES.SYSTEM.CONFIGURATION_ERROR,
      { provider }
    )
  }
}
