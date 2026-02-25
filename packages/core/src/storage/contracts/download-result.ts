/**
 * Download Result
 *
 * Result of downloading a file from storage.
 * Includes the file stream and metadata.
 */
export interface DownloadResult {
  /**
   * ReadableStream of file contents
   */
  toStream(): undefined | ReadableStream<Uint8Array>

  toString(): undefined | Promise<string>

  toArrayBuffer(): undefined | Promise<Uint8Array>

  /**
   * MIME type of the file (e.g., 'application/pdf', 'image/png')
   */
  contentType: string

  /**
   * Size of the file in bytes
   */
  size: number

  /**
   * Custom object metadata (S3-specific)
   * Key-value pairs stored with the object
   */
  metadata?: Record<string, string>
}
