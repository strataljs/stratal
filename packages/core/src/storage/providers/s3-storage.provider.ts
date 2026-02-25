import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageEntry } from 'stratal'
import type { DownloadResult, PresignedUrlResult, UploadOptions, UploadResult } from '../contracts'
import { StorageResponseBodyMissingError } from '../errors'
import type {
  CompletedPart,
  CompleteMultipartResult,
  CreateMultipartOptions,
  CreateMultipartResult,
  DeleteObjectsResult,
  HeadObjectResult,
  IS3MultipartProvider,
  ListMultipartUploadsResult,
  ListPartsResult,
  UploadPartResult,
} from './s3-multipart-provider.interface'
import type { StreamingBlobPayloadInputTypes } from './storage-provider.interface'

/**
 * S3 Storage Provider
 * Implements storage operations using AWS SDK for S3-compatible storage
 * Works with AWS S3, Cloudflare R2, MinIO, and other S3-compatible services
 *
 * Implements IS3MultipartProvider for multipart upload support needed by TUS
 */
export class S3StorageProvider implements IS3MultipartProvider {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly disk: string

  constructor(config: StorageEntry) {
    // Configure S3Client for S3-compatible storage
    this.client = new S3Client({
      region: config.region || 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    })

    this.bucket = config.bucket
    this.disk = config.disk
  }

  async upload(
    body: StreamingBlobPayloadInputTypes,
    path: string,
    options: UploadOptions
  ): Promise<UploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      Body: body,
      ContentType: options.mimeType,
      ContentLength: options.size,
      Metadata: options.metadata,
      Tagging: options.tagging,
    })

    await this.client.send(command)

    return {
      path,
      disk: this.disk,
      fullPath: `${this.bucket}/${path}`,
      size: options.size,
      mimeType: options.mimeType ?? 'application/octet-stream',
      uploadedAt: new Date(),
    }
  }

  async download(path: string): Promise<DownloadResult> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: path,
    })

    const response = await this.client.send(command)

    if (!response.Body) {
      throw new StorageResponseBodyMissingError(path)
    }

    return {
      toStream: () => response.Body?.transformToWebStream(),
      contentType: response.ContentType ?? 'application/octet-stream',
      size: response.ContentLength ?? 0,
      metadata: response.Metadata,
      toString: () => response.Body?.transformToString(),
      toArrayBuffer: () => response.Body?.transformToByteArray(),
    }
  }

  async delete(path: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: path,
    })

    await this.client.send(command)
  }

  async exists(path: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: path,
      })

      await this.client.send(command)
      return true
    } catch {
      // HeadObject throws error if file doesn't exist
      return false
    }
  }

  async getPresignedUrl(
    path: string,
    method: 'GET' | 'PUT' | 'DELETE' | 'HEAD',
    expiresIn: number
  ): Promise<PresignedUrlResult> {
    // Select appropriate command based on method
    let command
    switch (method) {
      case 'GET':
        command = new GetObjectCommand({ Bucket: this.bucket, Key: path })
        break
      case 'PUT':
        command = new PutObjectCommand({ Bucket: this.bucket, Key: path })
        break
      case 'DELETE':
        command = new DeleteObjectCommand({ Bucket: this.bucket, Key: path })
        break
      case 'HEAD':
        command = new HeadObjectCommand({ Bucket: this.bucket, Key: path })
        break
    }

    const url = await getSignedUrl(this.client, command as GetObjectCommand, { expiresIn })

    return {
      url,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      method,
    }
  }

  /**
   * Chunked upload for streaming data without known size
   * Uses @aws-sdk/lib-storage for multipart upload handling
   *
   * Benefits:
   * - Handles unknown Content-Length automatically
   * - Automatic retry on transient failures
   * - Cleanup of partial uploads on error
   * - Works with S3-compatible storage (R2, MinIO, RustFS)
   *
   * @param body - Content to upload (stream or buffer)
   * @param path - Full path including disk root
   * @param options - Upload options (mimeType required, size optional)
   * @returns Upload result with metadata
   */
  async chunkedUpload(
    body: StreamingBlobPayloadInputTypes,
    path: string,
    options: Omit<UploadOptions, 'size'> & { size?: number }
  ): Promise<UploadResult> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: path,
        Body: body,
        ContentType: options.mimeType,
      },
      // Concurrency configuration
      queueSize: 4,
      // Part size: 5MB minimum for S3
      partSize: 5 * 1024 * 1024,
      // Don't leave orphaned parts on error
      leavePartsOnError: false,
    })

    await upload.done()

    // Get the actual uploaded size via HeadObject
    const headResponse = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: path,
      })
    )

    return {
      path,
      disk: this.disk,
      fullPath: `${this.bucket}/${path}`,
      size: headResponse.ContentLength ?? options.size ?? 0,
      mimeType: options.mimeType ?? 'application/octet-stream',
      uploadedAt: new Date(),
    }
  }

  // ============================================
  // IS3MultipartProvider - Multipart upload methods
  // ============================================

  /**
   * Get the bucket name
   */
  getBucket(): string {
    return this.bucket
  }

  /**
   * Get object metadata without downloading the body
   */
  async headObject(key: string): Promise<HeadObjectResult | null> {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    )
    return {
      size: response.ContentLength ?? 0,
      contentType: response.ContentType,
      metadata: response.Metadata,
    }
  }

  /**
   * Delete multiple objects in a single request
   */
  async deleteObjects(keys: string[]): Promise<DeleteObjectsResult> {
    if (keys.length === 0) {
      return { deleted: 0, errors: [] }
    }

    const response = await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: keys.map((key) => ({ Key: key })),
        },
      })
    )

    return {
      deleted: response.Deleted?.length ?? 0,
      errors: (response.Errors ?? []).map((e) => ({
        key: e.Key ?? '',
        code: e.Code ?? 'Unknown',
        message: e.Message ?? 'Unknown error',
      })),
    }
  }

  /**
   * Create a multipart upload
   */
  async createMultipartUpload(
    key: string,
    options?: CreateMultipartOptions
  ): Promise<CreateMultipartResult> {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: options?.contentType,
        CacheControl: options?.cacheControl,
        Metadata: options?.metadata,
        Tagging: options?.tagging,
      })
    )

    return {
      uploadId: response.UploadId ?? '',
      key: response.Key ?? '',
    }
  }

  /**
   * Upload a part to an existing multipart upload
   */
  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Uint8Array
  ): Promise<UploadPartResult> {
    const response = await this.client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
        ContentLength: body.length,
      })
    )

    return {
      etag: response.ETag ?? '',
      partNumber,
    }
  }

  /**
   * Complete a multipart upload
   */
  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[]
  ): Promise<CompleteMultipartResult> {
    const response = await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({
            ETag: p.etag,
            PartNumber: p.partNumber,
          })),
        },
      })
    )

    return {
      location: response.Location,
      key: response.Key ?? '',
    }
  }

  /**
   * Abort a multipart upload
   */
  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      })
    )
  }

  /**
   * List parts of a multipart upload
   */
  async listParts(
    key: string,
    uploadId: string,
    partNumberMarker?: string
  ): Promise<ListPartsResult> {
    const response = await this.client.send(
      new ListPartsCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: partNumberMarker,
      })
    )

    return {
      parts: (response.Parts ?? []).map((p) => ({
        partNumber: p.PartNumber ?? 0,
        etag: p.ETag ?? '',
        size: p.Size ?? 0,
      })),
      isTruncated: response.IsTruncated ?? false,
      nextPartNumberMarker: response.NextPartNumberMarker?.toString(),
    }
  }

  /**
   * List all in-progress multipart uploads
   */
  async listMultipartUploads(
    keyMarker?: string,
    uploadIdMarker?: string
  ): Promise<ListMultipartUploadsResult> {
    const response = await this.client.send(
      new ListMultipartUploadsCommand({
        Bucket: this.bucket,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadIdMarker,
      })
    )

    return {
      uploads: (response.Uploads ?? []).map((u) => ({
        key: u.Key ?? '',
        uploadId: u.UploadId ?? '',
        initiated: u.Initiated,
      })),
      isTruncated: response.IsTruncated ?? false,
      nextKeyMarker: response.NextKeyMarker,
      nextUploadIdMarker: response.NextUploadIdMarker,
    }
  }
}
