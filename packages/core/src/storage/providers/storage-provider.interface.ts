import type {
  DownloadResult,
  HeadResult,
  ListOptions,
  ListResult,
  PresignedUrlResult,
  UploadOptions,
  UploadResult,
} from '../contracts'

/**
 * Streaming blob payload input types
 * Represents the types that can be used as the body of an upload operation
 */
export type StreamingBlobPayloadInputTypes =
  | ReadableStream
  | ArrayBuffer
  | ArrayBufferView
  | string
  | Blob
  | null

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
   * Delete many files in as few round trips as the provider allows
   * @param paths - Full paths to delete
   */
  deleteMany(paths: string[]): Promise<void>

  /**
   * Check if a file exists in storage
   * @param path - Full path to the file
   * @returns True if file exists, false otherwise
   */
  exists(path: string): Promise<boolean>

  /**
   * Read an object's metadata without transferring its body
   * @param path - Full path to the file
   * @returns Metadata, or null when no object exists at that path
   */
  head(path: string): Promise<HeadResult | null>

  /**
   * List objects, one page at a time
   *
   * Paginated by the provider. A caller that aggregates across a prefix must follow
   * `truncated`/`cursor` — see `ListResult`.
   *
   * @param options - Prefix, cursor and page limit, with paths full rather than disk-relative
   * @returns One page of matching objects
   */
  list(options: ListOptions): Promise<ListResult>

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
