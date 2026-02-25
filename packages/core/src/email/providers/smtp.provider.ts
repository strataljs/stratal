import type { Transporter } from 'nodemailer'
import * as nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import { Readable } from 'stream'
import type { ResolvedEmailAttachment, ResolvedEmailMessage } from '../contracts'
import type { EmailModuleOptions } from '../email.module'
import { EmailSmtpConnectionFailedError, SmtpConfigurationMissingError, SmtpHostMissingError } from '../errors'
import { BaseEmailProvider } from './base-email.provider'
import type { EmailSendResult } from './email-provider.interface'

/**
 * SMTP Email Provider
 *
 * Implementation of IEmailProvider using SMTP/nodemailer
 * Supports any SMTP server configured via SMTP_URL
 */
export class SmtpProvider extends BaseEmailProvider {
  private readonly transporter: Transporter<SMTPTransport.SentMessageInfo>
  private readonly defaultFrom: { name: string; email: string }

  constructor(
    private readonly options: EmailModuleOptions
  ) {
    super()

    // Validate SMTP configuration
    if (!this.options.smtp) {
      throw new SmtpConfigurationMissingError()
    }

    if (!this.options.smtp.host) {
      throw new SmtpHostMissingError()
    }

    // Create nodemailer transporter
    this.transporter = nodemailer.createTransport({
      host: this.options.smtp.host,
      port: this.options.smtp.port,
      secure: this.options.smtp.secure,
      auth: this.options.smtp.username && this.options.smtp.password
        ? {
          user: this.options.smtp.username,
          pass: this.options.smtp.password,
        }
        : undefined,
    })

    this.defaultFrom = this.options.from
  }

  async send(message: ResolvedEmailMessage): Promise<EmailSendResult> {
    try {
      const from = message.from
        ? `${message.from.name} <${message.from.email}>`
        : `${this.defaultFrom.name} <${this.defaultFrom.email}>`

      const info = await this.transporter.sendMail({
        from,
        to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo,
        cc: message.cc?.join(', '),
        bcc: message.bcc?.join(', '),
        attachments: message.attachments?.map(attachment => ({
          filename: attachment.filename,
          content: this.toNodeStream(attachment.content),
          contentType: attachment.contentType,
        })),
      })

      return {
        messageId: info.messageId,
        accepted: true,
        metadata: {
          provider: 'smtp',
          response: info.response,
        },
      }
    } catch {
      throw new EmailSmtpConnectionFailedError(
        this.options.smtp?.host ?? '',
        this.options.smtp?.port ?? 587
      )
    }
  }

  /**
   * Convert attachment content to Node.js stream format
   *
   * Nodemailer expects Node.js Readable streams, not web ReadableStream.
   * Buffer is passed through as-is since nodemailer supports it directly.
   */
  private toNodeStream(content: ResolvedEmailAttachment['content']): Buffer | Readable {
    if (Buffer.isBuffer(content)) {
      return content
    }
    // Convert web ReadableStream to Node.js Readable
    return Readable.fromWeb(content as Parameters<typeof Readable.fromWeb>[0])
  }
}
