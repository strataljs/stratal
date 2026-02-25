import type { IStorageProvider } from './storage-provider.interface'

/**
 * Options for creating a multipart upload
 */
export interface CreateMultipartOptions {
  /** Content type (MIME type) */
  contentType?: string
  /** Cache control header */
  cacheControl?: string
  /** Custom S3 metadata */
  metadata?: Record<string, string>
  /** S3 object tagging (key=value format) */
  tagging?: string
}

/**
 * Result of creating a multipart upload
 */
export interface CreateMultipartResult {
  /** S3 upload ID for subsequent part uploads */
  uploadId: string
  /** Object key */
  key: string
}

/**
 * Result of uploading a part
 */
export interface UploadPartResult {
  /** ETag returned by S3 */
  etag: string
  /** Part number */
  partNumber: number
}

/**
 * Part info for completing multipart upload
 */
export interface CompletedPart {
  /** ETag from uploadPart */
  etag: string
  /** Part number */
  partNumber: number
}

/**
 * Result of completing a multipart upload
 */
export interface CompleteMultipartResult {
  /** S3 location URL */
  location?: string
  /** Object key */
  key: string
}

/**
 * Individual part info from listParts
 */
export interface PartInfo {
  /** Part number */
  partNumber: number
  /** ETag */
  etag: string
  /** Part size in bytes */
  size: number
}

/**
 * Result of listing parts
 */
export interface ListPartsResult {
  /** List of uploaded parts */
  parts: PartInfo[]
  /** Whether there are more parts */
  isTruncated: boolean
  /** Marker for next page */
  nextPartNumberMarker?: string
}

/**
 * Individual upload info from listMultipartUploads
 */
export interface MultipartUploadInfo {
  /** Object key */
  key: string
  /** Upload ID */
  uploadId: string
  /** When the upload was initiated */
  initiated?: Date
}

/**
 * Result of listing multipart uploads
 */
export interface ListMultipartUploadsResult {
  /** List of in-progress uploads */
  uploads: MultipartUploadInfo[]
  /** Whether there are more uploads */
  isTruncated: boolean
  /** Marker for next page (key) */
  nextKeyMarker?: string
  /** Marker for next page (uploadId) */
  nextUploadIdMarker?: string
}

/**
 * Result of headObject
 */
export interface HeadObjectResult {
  /** Object size in bytes */
  size: number
  /** Content type */
  contentType?: string
  /** Custom metadata */
  metadata?: Record<string, string>
}

/**
 * Result of batch delete
 */
export interface DeleteObjectsResult {
  /** Number of objects deleted */
  deleted: number
  /** Errors that occurred */
  errors: {
    key: string
    code: string
    message: string
  }[]
}

/**
 * S3-specific storage provider interface with multipart upload support
 *
 * Extends the generic IStorageProvider with S3 multipart upload operations.
 * This interface is S3-specific - other providers (GCS, local) would have
 * their own resumable upload interfaces if needed.
 */
export interface IS3MultipartProvider extends IStorageProvider {
  // ============================================
  // Multipart upload primitives
  // ============================================

  /**
   * Create a multipart upload
   * @param key - Object key
   * @param options - Upload options
   * @returns Upload ID and key
   */
  createMultipartUpload(
    key: string,
    options?: CreateMultipartOptions
  ): Promise<CreateMultipartResult>

  /**
   * Upload a part to an existing multipart upload
   * @param key - Object key
   * @param uploadId - Upload ID from createMultipartUpload
   * @param partNumber - Part number (1-10000)
   * @param body - Part data
   * @returns ETag and part number
   */
  uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Uint8Array
  ): Promise<UploadPartResult>

  /**
   * Complete a multipart upload
   * @param key - Object key
   * @param uploadId - Upload ID
   * @param parts - List of completed parts with ETags
   * @returns Location and key
   */
  completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[]
  ): Promise<CompleteMultipartResult>

  /**
   * Abort a multipart upload
   * @param key - Object key
   * @param uploadId - Upload ID
   */
  abortMultipartUpload(key: string, uploadId: string): Promise<void>

  /**
   * List parts of a multipart upload
   * @param key - Object key
   * @param uploadId - Upload ID
   * @param partNumberMarker - Optional marker for pagination
   * @returns List of parts
   */
  listParts(
    key: string,
    uploadId: string,
    partNumberMarker?: string
  ): Promise<ListPartsResult>

  /**
   * List all in-progress multipart uploads
   * @param keyMarker - Optional key marker for pagination
   * @param uploadIdMarker - Optional upload ID marker for pagination
   * @returns List of uploads
   */
  listMultipartUploads(
    keyMarker?: string,
    uploadIdMarker?: string
  ): Promise<ListMultipartUploadsResult>

  // ============================================
  // Additional object operations
  // ============================================

  /**
   * Get object metadata without downloading the body
   * Unlike exists() which returns boolean, this returns actual metadata
   * @param key - Object key
   * @returns Object metadata or null if not found
   */
  headObject(key: string): Promise<HeadObjectResult | null>

  /**
   * Delete multiple objects in a single request
   * More efficient than individual delete() calls
   * @param keys - Array of object keys
   * @returns Delete results
   */
  deleteObjects(keys: string[]): Promise<DeleteObjectsResult>

  // ============================================
  // Bucket accessor
  // ============================================

  /**
   * Get the bucket name
   * @returns Bucket name from configuration
   */
  getBucket(): string
}
