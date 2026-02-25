import type { ResolvedEmailMessage } from '../contracts'

/**
 * Email Send Result
 *
 * Standard result returned by email providers after sending
 */
export interface EmailSendResult {
  /**
   * Unique message ID from the provider
   */
  messageId: string

  /**
   * Whether the email was accepted for delivery
   */
  accepted: boolean

  /**
   * Optional provider-specific metadata
   */
  metadata?: Record<string, unknown>
}

/**
 * Batch Email Send Result
 *
 * Result for batch email operations
 */
export interface EmailBatchSendResult {
  /**
   * Total number of emails sent
   */
  total: number

  /**
   * Number of successfully sent emails
   */
  successful: number

  /**
   * Number of failed emails
   */
  failed: number

  /**
   * Individual results for each email
   */
  results: EmailSendResult[]
}

/**
 * Email Provider Interface
 *
 * All email provider implementations (Resend, SMTP, etc.) must implement this interface.
 * This allows the EmailService to work with any provider without knowing the implementation details.
 */
export interface IEmailProvider {
  /**
   * Send a single email
   *
   * @param message - The resolved email message to send (attachments as Buffer)
   * @returns Promise that resolves with send result
   */
  send(message: ResolvedEmailMessage): Promise<EmailSendResult>

  /**
   * Send multiple emails in a batch
   *
   * @param messages - Array of resolved email messages to send
   * @returns Promise that resolves with batch send result
   */
  sendBatch(messages: ResolvedEmailMessage[]): Promise<EmailBatchSendResult>
}
