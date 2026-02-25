import { z } from '../../i18n/validation'

/**
 * Upload options for streaming uploads
 */
export interface UploadOptions {
  /**
   * Size of the content in bytes
   */
  size: number
  /**
   * MIME type of the content
   */
  mimeType?: string
  /**
   * Custom metadata to store with the object (S3-specific)
   * Stored as S3 object metadata headers
   */
  metadata?: Record<string, string>
  /**
   * Object tagging for lifecycle policies (S3-specific)
   * Format: key=value (e.g., "Tus-Completed=true")
   */
  tagging?: string
}

export const uploadResultSchema = z.object({
  path: z.string(),
  disk: z.string(),
  fullPath: z.string(),
  size: z.number(),
  mimeType: z.string(),
  uploadedAt: z.date(),
})

export type UploadResult = z.infer<typeof uploadResultSchema>
