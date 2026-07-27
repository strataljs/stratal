import { array, maxLength, minLength, object, optional, record, string, unknown } from 'zod/mini'
import type { infer as Infer } from 'zod/mini'
import { emailContentRule, emailMessageObject } from './email-message.contract'

/**
 * Send Email Input Schema
 *
 * Input schema for sending emails through the EmailService. Extends the base
 * email message object with optional metadata, re-applying the html-or-text
 * rule (a refined schema can't be extended directly).
 */
export const sendEmailInputSchema = object({
  ...emailMessageObject.shape,
  /**
   * Optional metadata to include with the email
   * Can be used for tracking, categorization, etc.
   */
  metadata: optional(record(string(), unknown())),
}).check(emailContentRule)

/**
 * Type definition for send email input
 */
export type SendEmailInput = Infer<typeof sendEmailInputSchema>

/**
 * Send Batch Email Input Schema
 *
 * Schema for sending multiple emails in a batch
 */
export const sendBatchEmailInputSchema = object({
  /**
   * Array of email messages to send
   */
  messages: array(sendEmailInputSchema).check(minLength(1), maxLength(100)),
})

/**
 * Type definition for send batch email input
 */
export type SendBatchEmailInput = Infer<typeof sendBatchEmailInputSchema>
