import { Resend } from 'resend'
import type { ResolvedEmailAttachment, ResolvedEmailMessage } from '../contracts'
import type { EmailModuleOptions } from '../email.module'
import { EmailResendApiFailedError, ResendApiKeyMissingError } from '../errors'
import { BaseEmailProvider } from './base-email.provider'
import type { EmailSendResult } from './email-provider.interface'

/**
 * Resend Email Provider
 *
 * Implementation of IEmailProvider using Resend API
 * Docs: https://resend.com/docs
 */
export class ResendProvider extends BaseEmailProvider {
  private readonly client: Resend
  private readonly defaultFrom: { name: string; email: string }

  constructor(
    private readonly options: EmailModuleOptions
  ) {
    super()

    // Validate Resend API key
    if (!this.options.apiKey) {
      throw new ResendApiKeyMissingError()
    }

    this.client = new Resend(this.options.apiKey)
    this.defaultFrom = this.options.from
  }

  async send(message: ResolvedEmailMessage): Promise<EmailSendResult> {
    try {
      const from = message.from
        ? `${message.from.name} <${message.from.email}>`
        : `${this.defaultFrom.name} <${this.defaultFrom.email}>`

      const to = Array.isArray(message.to) ? message.to : [message.to]

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Resend SDK types
      const response = await this.client.emails.send({
        from,
        to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Resend template extension
        ...((message as any).template && { template: (message as any).template }),
        ...(message.replyTo && { replyTo: message.replyTo }),
        ...(message.cc && { cc: message.cc }),
        ...(message.bcc && { bcc: message.bcc }),
        ...(message.attachments && {
          attachments: await Promise.all(
            message.attachments.map(async attachment => ({
              filename: attachment.filename,
              content: await this.toBuffer(attachment.content),
            }))
          ),
        }),
      })

      if (response.error) {
        throw new EmailResendApiFailedError()
      }

      return {
        messageId: response.data.id,
        accepted: true,
        metadata: {
          provider: 'resend',
        },
      }
    } catch (error) {
      if (error instanceof EmailResendApiFailedError || error instanceof ResendApiKeyMissingError) {
        throw error
      }

      throw new EmailResendApiFailedError()
    }
  }

  /**
   * Convert attachment content to Buffer
   *
   * Resend SDK expects Buffer for attachment content.
   * If content is already a Buffer, return as-is.
   * If content is a ReadableStream, convert to Buffer.
   */
  private async toBuffer(content: ResolvedEmailAttachment['content']): Promise<Buffer> {
    if (Buffer.isBuffer(content)) {
      return content
    }
    // Convert ReadableStream to Buffer
    const response = new Response(content)
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}
