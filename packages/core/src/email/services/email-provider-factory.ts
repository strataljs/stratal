import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import type { EmailModuleOptions } from '../email.module'
import { EMAIL_TOKENS } from '../email.tokens'
import { EmailProviderNotSupportedError } from '../errors'
import type { IEmailProvider } from '../providers/email-provider.interface'

/**
 * Email Provider Factory
 *
 * Creates email provider instances based on configuration.
 * Supports automatic provider selection from module options.
 *
 * Providers are loaded lazily via dynamic imports to avoid pulling in
 * heavy Node.js-only dependencies (e.g. nodemailer) at module parse time,
 * which would break Cloudflare Workers and vitest-pool-workers environments.
 */
@Transient(EMAIL_TOKENS.EmailProviderFactory)
export class EmailProviderFactory {
  constructor(
    @inject(EMAIL_TOKENS.Options)
    private readonly options: EmailModuleOptions
  ) { }

  /**
   * Create email provider instance based on configuration
   *
   * @returns Email provider implementation
   * @throws EmailProviderNotSupportedError if provider is not supported
   */
  async create(): Promise<IEmailProvider> {
    switch (this.options.provider) {
      case 'resend': {
        const { ResendProvider } = await import('../providers/resend.provider')
        return new ResendProvider(this.options)
      }

      case 'smtp': {
        const { SmtpProvider } = await import('../providers/smtp.provider')
        return new SmtpProvider(this.options)
      }

      default:
        throw new EmailProviderNotSupportedError(this.options.provider)
    }
  }
}
