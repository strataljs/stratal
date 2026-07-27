import { array, email, maxLength, minLength, object, optional, refine, string, union } from 'zod/mini'
import type { infer as Infer } from 'zod/mini'
import { withZodI18n } from '../../i18n/validation'
import { emailAttachmentSchema, type ResolvedEmailAttachment } from './email-attachment'

/**
 * Email Address Schema
 *
 * Represents an email address with optional name
 */
export const emailAddressSchema = object({
  name: optional(string()),
  email: email(),
})

/**
 * Base email message object (without the html-or-text rule). Exported so
 * schemas that need to add fields can extend it and re-apply the rule — mini
 * objects can't be extended once a refinement is attached.
 */
export const emailMessageObject = object({
  /** Recipient email address(es). A single email string or an array of emails. */
  to: union([email(), array(email())]),

  /** Sender email address with optional name. Falls back to config default. */
  from: optional(emailAddressSchema),

  /** Email subject line */
  subject: string().check(minLength(1), maxLength(500)),

  /** HTML content of the email. Either html or text must be provided. */
  html: optional(string()),

  /** Plain text content of the email. Either html or text must be provided. */
  text: optional(string()),

  /** Reply-to email address */
  replyTo: optional(email()),

  /** CC recipients */
  cc: optional(array(email())),

  /** BCC recipients */
  bcc: optional(array(email())),

  /** Email attachments */
  attachments: optional(array(emailAttachmentSchema)),
})

/** Rule enforcing that at least one of `html` / `text` is present. */
export const emailContentRule = refine(
  (data: unknown) => {
    const { html, text } = data as { html?: string; text?: string }
    return Boolean(html ?? text)
  },
  withZodI18n('zodI18n.errors.custom.emailOrTextRequired'),
)

/**
 * Base Email Message Schema
 *
 * Defines the core structure for email messages.
 * Ensures either html or text content is provided.
 */
export const emailMessageSchema = emailMessageObject.check(emailContentRule)

/**
 * Type definition for email message
 */
export type EmailMessage = Infer<typeof emailMessageSchema>

/**
 * Type definition for email address
 */
export type EmailAddress = Infer<typeof emailAddressSchema>

/**
 * Resolved Email Message
 *
 * Email message with attachments resolved to Buffer content.
 * Used by providers after the consumer resolves storage-based attachments.
 */
export type ResolvedEmailMessage = Omit<EmailMessage, 'attachments'> & {
  attachments?: ResolvedEmailAttachment[]
}
