import { date, number, object, string } from 'zod/mini'
import type { infer as Infer } from 'zod/mini'

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

export const uploadResultSchema = object({
  path: string(),
  disk: string(),
  fullPath: string(),
  size: number(),
  mimeType: string(),
  uploadedAt: date(),
})

export type UploadResult = Infer<typeof uploadResultSchema>
