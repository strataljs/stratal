import { inject } from '../../di'
import { Transient } from '../../di/decorators'
import type { EmailModuleOptions } from '../email.module'
import { EMAIL_TOKENS } from '../email.tokens'
import type { IEmailProvider } from '../providers/email-provider.interface'
import { SmtpProvider } from '../providers/smtp.provider'

@Transient(EMAIL_TOKENS.EmailProviderFactory)
export class EmailProviderFactory {
  constructor(
    @inject(EMAIL_TOKENS.Options)
    private readonly options: EmailModuleOptions
  ) { }

  create(): IEmailProvider {
    return new SmtpProvider(this.options)
  }
}
