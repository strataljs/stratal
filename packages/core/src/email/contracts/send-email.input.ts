import { z } from '../../i18n/validation'
import { emailMessageSchema } from './email-message.contract'

/**
 * Send Email Input Schema
 *
 * Input schema for sending emails through the EmailService.
 * Extends the base email message with optional metadata.
 * Uses safeExtend() because emailMessageSchema contains refinements.
 */
export const sendEmailInputSchema = emailMessageSchema.safeExtend({
  /**
   * Optional metadata to include with the email
   * Can be used for tracking, categorization, etc.
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Type definition for send email input
 */
export type SendEmailInput = z.infer<typeof sendEmailInputSchema>

/**
 * Send Batch Email Input Schema
 *
 * Schema for sending multiple emails in a batch
 */
export const sendBatchEmailInputSchema = z.object({
  /**
   * Array of email messages to send
   */
  messages: z.array(sendEmailInputSchema).min(1).max(100),
})

/**
 * Type definition for send batch email input
 */
export type SendBatchEmailInput = z.infer<typeof sendBatchEmailInputSchema>
