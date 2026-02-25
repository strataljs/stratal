import { z } from '../../i18n/validation'

/**
 * Inline Email Attachment Schema
 *
 * Attachment with content embedded as base64 string.
 * Use for small files that can fit in queue message.
 */
export const inlineEmailAttachmentSchema = z.object({
  /**
   * Filename to display for the attachment
   */
  filename: z.string().min(1).max(255),

  /**
   * Base64 encoded content of the attachment
   */
  content: z.string(),

  /**
   * MIME type of the attachment (e.g., 'application/pdf', 'image/png')
   */
  contentType: z.string(),

  /**
   * Optional size of the attachment in bytes
   */
  size: z.number().positive().optional(),
})

/**
 * Storage Email Attachment Schema
 *
 * Attachment stored in cloud storage.
 * Content type and size are derived from storage metadata.
 * Use for large files to avoid queue message size limits.
 */
export const storageEmailAttachmentSchema = z.object({
  /**
   * Filename to display for the attachment
   */
  filename: z.string().min(1).max(255),

  /**
   * Path to the file in storage
   */
  storageKey: z.string(),

  /**
   * Optional storage disk name (uses default if not provided)
   */
  disk: z.string().optional(),
})

/**
 * Email Attachment Schema
 *
 * Union type - type is inferred from presence of `content` vs `storageKey`.
 * - If `content` is present: inline attachment
 * - If `storageKey` is present: storage-based attachment
 */
export const emailAttachmentSchema = z.union([
  inlineEmailAttachmentSchema,
  storageEmailAttachmentSchema,
])

/**
 * Type definitions
 */
export type InlineEmailAttachment = z.infer<typeof inlineEmailAttachmentSchema>
export type StorageEmailAttachment = z.infer<typeof storageEmailAttachmentSchema>
export type EmailAttachment = z.infer<typeof emailAttachmentSchema>

/**
 * Resolved Email Attachment
 *
 * Attachment after resolution, ready for email provider.
 * Content can be Buffer (for inline) or ReadableStream (for storage-based).
 * Both nodemailer and Resend support these formats directly.
 */
export interface ResolvedEmailAttachment {
  filename: string
  content: Buffer | ReadableStream
  contentType: string
}
