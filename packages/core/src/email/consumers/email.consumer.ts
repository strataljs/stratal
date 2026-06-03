import { inject } from '../../di'
import { Transient } from '../../di/decorators'
import { LOGGER_TOKENS, type LoggerService } from '../../logger'
import type { IQueueConsumer, QueueMessage } from '../../queue/queue-consumer'
import { STORAGE_TOKENS, type StorageService } from '../../storage'
import type { EmailAttachment, ResolvedEmailAttachment, SendEmailInput } from '../contracts'
import { EmailError } from '../email.error'
import { EMAIL_TOKENS } from '../email.tokens'
import type { EmailProviderFactory } from '../services/email-provider-factory'

/**
 * Strictly decode a base64 attachment payload. `Buffer.from(_, 'base64')` is
 * lenient and silently drops invalid characters, which would ship a corrupt
 * attachment. We re-encode and compare (modulo canonical padding) to reject
 * malformed input loudly instead.
 */
function decodeBase64Attachment(content: string, filename: string): Buffer {
  const buffer = Buffer.from(content, 'base64')
  // Canonicalise the input (strip padding) and the round-tripped output, then
  // compare: any dropped/invalid byte produces a mismatch.
  const normalize = (value: string): string => value.replace(/=+$/, '')
  if (normalize(buffer.toString('base64')) !== normalize(content)) {
    throw new EmailError(`Invalid base64 content for attachment "${filename}"`)
  }
  return buffer
}

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
    const { type, payload } = message
    const recipientCount = Array.isArray(payload.to) ? payload.to.length : 1

    this.logger.info('Processing email message', {
      type,
      recipientCount,
      hasHtml: !!payload.html,
      hasText: !!payload.text,
      hasAttachments: !!payload.attachments?.length,
    })

    try {
      // Resolve storage-based attachments before sending
      const resolvedAttachments = await this.resolveAttachments(payload.attachments)

      const provider = this.providerFactory.create()
      const result = await provider.send({
        ...payload,
        attachments: resolvedAttachments,
      })

      this.logger.info('Email sent successfully', {
        type,
        recipientCount,
        messageId: result.messageId,
      })
    }
    catch (error) {
      this.logger.error('Failed to send email', {
        type,
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
          content: decodeBase64Attachment(attachment.content, attachment.filename),
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
