import type { PutObjectCommandInput } from '@aws-sdk/client-s3'
import type { DownloadResult, PresignedUrlResult, UploadOptions, UploadResult } from '../contracts'

/**
 * Streaming blob payload input types from AWS SDK
 * Represents the types that can be used as the Body of a PutObjectCommand
 */
export type StreamingBlobPayloadInputTypes = PutObjectCommandInput['Body']

/**
 * Storage provider interface
 * Defines the contract for storage implementations (R2, S3, GCS, etc.)
 */
export interface IStorageProvider {
  /**
   * Upload content to storage
   * @param body - Content to upload (stream, buffer, or string)
   * @param path - Full path including disk root
   * @param options - Upload options including size and mime type
   * @returns Upload result with metadata
   */
  upload(body: StreamingBlobPayloadInputTypes, path: string, options: UploadOptions): Promise<UploadResult>

  /**
   * Download a file from storage
   * @param path - Full path to the file
   * @returns Download result with stream and metadata
   */
  download(path: string): Promise<DownloadResult>

  /**
   * Delete a file from storage
   * @param path - Full path to the file
   */
  delete(path: string): Promise<void>

  /**
   * Check if a file exists in storage
   * @param path - Full path to the file
   * @returns True if file exists, false otherwise
   */
  exists(path: string): Promise<boolean>

  /**
   * Generate a presigned URL for temporary access
   * @param path - Full path to the file
   * @param method - HTTP method (GET, PUT, DELETE, HEAD)
   * @param expiresIn - Expiry time in seconds (1-604800)
   * @returns Presigned URL result
   */
  getPresignedUrl(
    path: string,
    method: 'GET' | 'PUT' | 'DELETE' | 'HEAD',
    expiresIn: number
  ): Promise<PresignedUrlResult>

  /**
   * Chunked upload for streaming data without known size
   * Uses multipart upload under the hood for reliability
   * @param body - Content to upload (stream or buffer)
   * @param path - Full path including disk root
   * @param options - Upload options (mimeType required, size optional)
   * @returns Upload result with metadata
   */
  chunkedUpload(
    body: StreamingBlobPayloadInputTypes,
    path: string,
    options: Omit<UploadOptions, 'size'> & { size?: number }
  ): Promise<UploadResult>
}
