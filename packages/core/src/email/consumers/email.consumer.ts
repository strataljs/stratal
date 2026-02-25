import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import { LOGGER_TOKENS, type LoggerService } from '../../logger'
import type { IQueueConsumer, QueueMessage } from '../../queue/queue-consumer'
import { STORAGE_TOKENS, type StorageService } from '../../storage'
import type { EmailAttachment, ResolvedEmailAttachment, SendEmailInput } from '../contracts'
import { EMAIL_TOKENS } from '../email.tokens'
import type { EmailProviderFactory } from '../services/email-provider-factory'

/**
 * Email Consumer
 *
 * Generic queue consumer that handles email.send and email.batch.send messages
 * from ANY queue. Message routing is based on message type, not queue name.
 *
 * This consumer:
 * - Resolves storage-based attachments to streams
 * - Creates email provider instances via factory
 * - Sends emails with proper logging (no PII)
 * - Handles errors with retry support
 *
 * @example
 * ```typescript
 * // Registered in EmailModule
 * @Module({
 *   consumers: [EmailConsumer]
 * })
 * ```
 */
@Transient()
export class EmailConsumer implements IQueueConsumer<SendEmailInput> {
  readonly messageTypes = ['email.send', 'email.batch.send']

  constructor(
    @inject(LOGGER_TOKENS.LoggerService)
    private readonly logger: LoggerService,
    @inject(EMAIL_TOKENS.EmailProviderFactory)
    private readonly providerFactory: EmailProviderFactory,
    @inject(STORAGE_TOKENS.StorageService)
    private readonly storage: StorageService
  ) { }

  async handle(message: QueueMessage<SendEmailInput>): Promise<void> {
    const { type, payload, tenantId } = message
    const recipientCount = Array.isArray(payload.to) ? payload.to.length : 1

    this.logger.info('Processing email message', {
      type,
      tenantId,
      recipientCount,
      hasHtml: !!payload.html,
      hasText: !!payload.text,
      hasAttachments: !!payload.attachments?.length,
    })

    try {
      // Resolve storage-based attachments before sending
      const resolvedAttachments = await this.resolveAttachments(payload.attachments)

      const provider = await this.providerFactory.create()
      const result = await provider.send({
        ...payload,
        attachments: resolvedAttachments,
      })

      this.logger.info('Email sent successfully', {
        type,
        tenantId,
        recipientCount,
        messageId: result.messageId,
      })
    }
    catch (error) {
      this.logger.error('Failed to send email', {
        type,
        tenantId,
        recipientCount,
        error: (error as Error).message,
      })
      throw error // Retry via queue
    }
  }

  onError(error: Error, message: QueueMessage<SendEmailInput>): Promise<void> {
    const recipientCount = Array.isArray(message.payload.to)
      ? message.payload.to.length
      : 1

    this.logger.error('Email send failed after retries', {
      tenantId: message.tenantId,
      recipientCount,
      error: error.message,
      stack: error.stack,
    })

    return Promise.resolve()
  }

  /**
   * Resolve email attachments
   *
   * Converts attachment schemas to resolved attachments.
   * - Inline attachments: decode base64 to Buffer
   * - Storage attachments: pass stream directly (providers support streams)
   */
  private async resolveAttachments(
    attachments: EmailAttachment[] | undefined
  ): Promise<ResolvedEmailAttachment[] | undefined> {
    if (!attachments?.length) return undefined

    return Promise.all(attachments.map(async (attachment) => {
      // Check for inline attachment (has content property)
      if ('content' in attachment) {
        return {
          filename: attachment.filename,
          content: Buffer.from(attachment.content, 'base64'),
          contentType: attachment.contentType,
        }
      }

      // Storage attachment - pass stream directly to provider
      const result = await this.storage.download(
        attachment.storageKey,
        attachment.disk
      )

      return {
        filename: attachment.filename,
        content: result.toStream() ?? Buffer.alloc(0),
        contentType: result.contentType,
      }
    }))
  }
}
