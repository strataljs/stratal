import { withI18n, z } from '../../i18n/validation'
import { emailAttachmentSchema, type ResolvedEmailAttachment } from './email-attachment'

/**
 * Email Address Schema
 *
 * Represents an email address with optional name
 */
export const emailAddressSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
})

/**
 * Base Email Message Schema
 *
 * Defines the core structure for email messages.
 * Ensures either html or text content is provided.
 */
export const emailMessageSchema = z
  .object({
    /**
     * Recipient email address(es)
     * Can be a single email string or array of emails
     */
    to: z.union([z.string().email(), z.array(z.string().email())]),

    /**
     * Sender email address with optional name
     * Falls back to default from config if not provided
     */
    from: emailAddressSchema.optional(),

    /**
     * Email subject line
     */
    subject: z.string().min(1).max(500),

    /**
     * HTML content of the email
     * Either html or text must be provided
     */
    html: z.string().optional(),

    /**
     * Plain text content of the email
     * Either html or text must be provided
     */
    text: z.string().optional(),

    /**
     * Reply-to email address
     */
    replyTo: z.string().email().optional(),

    /**
     * CC recipients
     */
    cc: z.array(z.string().email()).optional(),

    /**
     * BCC recipients
     */
    bcc: z.array(z.string().email()).optional(),

    /**
     * Email attachments
     */
    attachments: z.array(emailAttachmentSchema).optional(),
  })
  .refine(
    (data) => data.html ?? data.text,
    withI18n('zodI18n.errors.custom.emailOrTextRequired')
  )

/**
 * Type definition for email message
 */
export type EmailMessage = z.infer<typeof emailMessageSchema>

/**
 * Type definition for email address
 */
export type EmailAddress = z.infer<typeof emailAddressSchema>

/**
 * Resolved Email Message
 *
 * Email message with attachments resolved to Buffer content.
 * Used by providers after the consumer resolves storage-based attachments.
 */
export type ResolvedEmailMessage = Omit<EmailMessage, 'attachments'> & {
  attachments?: ResolvedEmailAttachment[]
}
