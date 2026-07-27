import { maxLength, minLength, number, object, optional, positive, string, union } from 'zod/mini'
import type { infer as Infer } from 'zod/mini'

/**
 * Inline Email Attachment Schema
 *
 * Attachment with content embedded as base64 string.
 * Use for small files that can fit in queue message.
 */
export const inlineEmailAttachmentSchema = object({
  /**
   * Filename to display for the attachment
   */
  filename: string().check(minLength(1), maxLength(255)),

  /**
   * Base64 encoded content of the attachment
   */
  content: string(),

  /**
   * MIME type of the attachment (e.g., 'application/pdf', 'image/png')
   */
  contentType: string(),

  /**
   * Optional size of the attachment in bytes
   */
  size: optional(number().check(positive())),
})

/**
 * Storage Email Attachment Schema
 *
 * Attachment stored in cloud storage.
 * Content type and size are derived from storage metadata.
 * Use for large files to avoid queue message size limits.
 */
export const storageEmailAttachmentSchema = object({
  /**
   * Filename to display for the attachment
   */
  filename: string().check(minLength(1), maxLength(255)),

  /**
   * Path to the file in storage
   */
  storageKey: string(),

  /**
   * Optional storage disk name (uses default if not provided)
   */
  disk: optional(string()),
})

/**
 * Email Attachment Schema
 *
 * Union type - type is inferred from presence of `content` vs `storageKey`.
 * - If `content` is present: inline attachment
 * - If `storageKey` is present: storage-based attachment
 */
export const emailAttachmentSchema = union([
  inlineEmailAttachmentSchema,
  storageEmailAttachmentSchema,
])

/**
 * Type definitions
 */
export type InlineEmailAttachment = Infer<typeof inlineEmailAttachmentSchema>
export type StorageEmailAttachment = Infer<typeof storageEmailAttachmentSchema>
export type EmailAttachment = Infer<typeof emailAttachmentSchema>

/**
 * Resolved Email Attachment
 *
 * Attachment after resolution, ready for email provider.
 * Content can be Buffer (for inline) or ReadableStream (for storage-based).
 */
export interface ResolvedEmailAttachment {
  filename: string
  content: Buffer | ReadableStream
  contentType: string
}
