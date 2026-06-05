import type { ResolvedEmailMessage } from '../contracts'
import type { EmailModuleOptions } from '../email.module'
import { EmailError } from '../email.error'
import { SmtpClient } from '../smtp/smtp-client'
import { buildMimeMessage } from '../smtp/mime'
import { BaseEmailProvider } from './base-email.provider'
import type { EmailSendResult } from './email-provider.interface'

export class SmtpProvider extends BaseEmailProvider {
  constructor(
    private readonly options: EmailModuleOptions
  ) {
    super()

    if (!this.options.smtp?.url) {
      throw new EmailError('SMTP URL is required')
    }
  }

  async send(message: ResolvedEmailMessage): Promise<EmailSendResult> {
    const mime = await buildMimeMessage(message, this.options.from)

    try {
      const client = new SmtpClient(this.options.smtp)
      const result = await client.send(mime.raw, {
        from: mime.envelope.from,
        to: mime.envelope.to,
      })

      return {
        messageId: result.messageId,
        accepted: true,
        metadata: { provider: 'smtp' },
      }
    }
    catch (error) {
      if (error instanceof EmailError) throw error
      throw new EmailError(`SMTP send failed: ${(error as Error).message}`)
    }
  }
}
