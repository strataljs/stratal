import type { ResolvedEmailMessage } from '../contracts'
import type { EmailBatchSendResult, EmailSendResult, IEmailProvider } from './email-provider.interface'

/**
 * Base Email Provider
 *
 * Abstract base class for email providers.
 * Provides shared implementation of sendBatch() to reduce code duplication.
 */
export abstract class BaseEmailProvider implements IEmailProvider {
  /**
   * Send a single email - must be implemented by concrete providers
   */
  abstract send(message: ResolvedEmailMessage): Promise<EmailSendResult>

  /**
   * Send multiple emails in a batch
   *
   * Default implementation sends emails sequentially.
   * Concrete providers can override for optimized batch sending.
   */
  async sendBatch(messages: ResolvedEmailMessage[]): Promise<EmailBatchSendResult> {
    const results: EmailSendResult[] = []
    let successful = 0
    let failed = 0

    for (const message of messages) {
      try {
        const result = await this.send(message)
        results.push(result)
        successful++
      }
      catch (error) {
        results.push({
          messageId: '',
          accepted: false,
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        })
        failed++
      }
    }

    return {
      total: messages.length,
      successful,
      failed,
      results,
    }
  }
}
