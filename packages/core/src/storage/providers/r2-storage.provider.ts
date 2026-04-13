import { type StratalEnv } from '../../env'
import { signUrl } from '../../router/signed-url'
import type { DownloadResult, PresignedUrlResult, UploadOptions, UploadResult } from '../contracts'
import { R2PresignedUrlSecretMissingError, StorageResponseBodyMissingError } from '../errors'
import type { StorageEntry, StorageRouteConfig } from '../types'
import type {
  CompletedPart,
  CompleteMultipartResult,
  CreateMultipartOptions,
  CreateMultipartResult,
  DeleteObjectsResult,
  HeadObjectResult,
  IMultipartProvider,
  ListMultipartUploadsResult,
  ListPartsResult,
  UploadPartResult,
} from './multipart-provider.interface'
import type { StreamingBlobPayloadInputTypes } from './storage-provider.interface'

const MIN_PART_SIZE = 5 * 1024 * 1024 // 5MB
const MULTIPART_PREFIX = '__multipart/'
const PARTS_PREFIX = '__parts/'

/**
 * R2 Storage Provider
 * Implements storage operations using native Cloudflare R2 bindings
 *
 * Implements IMultipartProvider for multipart upload support needed by TUS.
 * Tracks multipart upload metadata using companion R2 objects so that
 * listParts/listMultipartUploads work in all environments (local, test, prod).
 */
export class R2StorageProvider implements IMultipartProvider {
  private readonly routeBasePath: string

  constructor(
    private readonly config: StorageEntry,
    private readonly bucket: R2Bucket,
    private readonly env: StratalEnv,
    routeConfig?: StorageRouteConfig
  ) {
    this.routeBasePath = routeConfig?.basePath ?? '/storage'
  }

  async upload(
    body: StreamingBlobPayloadInputTypes,
    path: string,
    options: UploadOptions
  ): Promise<UploadResult> {
    const customMetadata: Record<string, string> = { ...options.metadata }
    if (options.tagging) {
      customMetadata['x-tags'] = options.tagging
    }

    await this.bucket.put(path, body as ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null, {
      httpMetadata: {
        contentType: options.mimeType,
      },
      customMetadata,
    })

    return {
      path,
      disk: this.config.disk,
      fullPath: path,
      size: options.size,
      mimeType: options.mimeType ?? 'application/octet-stream',
      uploadedAt: new Date(),
    }
  }

  async download(path: string): Promise<DownloadResult> {
    const obj = await this.bucket.get(path)

    if (!obj) {
      throw new StorageResponseBodyMissingError(path)
    }

    // R2ObjectBody has body, text(), arrayBuffer(), etc.
    const objBody = obj

    return {
      toStream: () => objBody.body as ReadableStream<Uint8Array>,
      contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
      size: obj.size,
      metadata: obj.customMetadata,
      toString: () => objBody.text(),
      toArrayBuffer: () => objBody.bytes(),
    }
  }

  async delete(path: string): Promise<void> {
    await this.bucket.delete(path)
  }

  async exists(path: string): Promise<boolean> {
    const head = await this.bucket.head(path)
    return head !== null
  }

  async getPresignedUrl(
    path: string,
    method: 'GET' | 'PUT' | 'DELETE' | 'HEAD',
    expiresIn: number
  ): Promise<PresignedUrlResult> {
    const secret = this.env.APP_SECRET;
    if (!secret) {
      throw new R2PresignedUrlSecretMissingError()
    }

    // Build a relative URL pointing to the StorageController route
    const routePath = `${this.routeBasePath}/${this.config.disk}/${path}`
    const urlWithMethod = `${routePath}?method=${method}`
    const url = await signUrl(urlWithMethod, secret, { expiresIn })

    return {
      url,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      method,
    }
  }

  async chunkedUpload(
    body: StreamingBlobPayloadInputTypes,
    path: string,
    options: Omit<UploadOptions, 'size'> & { size?: number }
  ): Promise<UploadResult> {
    const multipartUpload = await this.bucket.createMultipartUpload(path, {
      httpMetadata: {
        contentType: options.mimeType,
      },
      customMetadata: options.metadata,
    })

    const parts: R2UploadedPart[] = []

    try {
      if (body instanceof ReadableStream) {
        const reader = (body as ReadableStream<Uint8Array>).getReader()
        let buffer = new Uint8Array(0)
        let partNumber = 1

        while (true) {
          const { done, value } = await reader.read()

          if (value) {
            const newBuffer = new Uint8Array(buffer.length + value.length)
            newBuffer.set(buffer, 0)
            newBuffer.set(value, buffer.length)
            buffer = newBuffer
          }

          while (buffer.length >= MIN_PART_SIZE) {
            const partData = buffer.slice(0, MIN_PART_SIZE)
            buffer = buffer.slice(MIN_PART_SIZE)
            const part = await multipartUpload.uploadPart(partNumber, partData)
            parts.push(part)
            partNumber++
          }

          if (done) {
            // Upload remaining buffer as final part
            if (buffer.length > 0) {
              const part = await multipartUpload.uploadPart(partNumber, buffer)
              parts.push(part)
            }
            break
          }
        }
      } else if (body !== null && body !== undefined) {
        // Non-stream body: upload as single part
        const part = await multipartUpload.uploadPart(1, body as ArrayBuffer | ArrayBufferView | string | Blob)
        parts.push(part)
      }

      await multipartUpload.complete(parts)
    } catch (error) {
      await multipartUpload.abort()
      throw error
    }

    // Get actual size via head
    const headResult = await this.bucket.head(path)

    return {
      path,
      disk: this.config.disk,
      fullPath: path,
      size: headResult?.size ?? options.size ?? 0,
      mimeType: options.mimeType ?? 'application/octet-stream',
      uploadedAt: new Date(),
    }
  }

  // ============================================
  // IMultipartProvider - Multipart upload methods
  // ============================================

  getBucket(): string {
    return this.config.binding
  }

  async headObject(key: string): Promise<HeadObjectResult | null> {
    const obj = await this.bucket.head(key)
    if (!obj) {
      return null
    }
    return {
      size: obj.size,
      contentType: obj.httpMetadata?.contentType,
      metadata: obj.customMetadata,
    }
  }

  async deleteObjects(keys: string[]): Promise<DeleteObjectsResult> {
    if (keys.length === 0) {
      return { deleted: 0, errors: [] }
    }

    await this.bucket.delete(keys)

    return {
      deleted: keys.length,
      errors: [],
    }
  }

  async createMultipartUpload(
    key: string,
    options?: CreateMultipartOptions
  ): Promise<CreateMultipartResult> {
    const upload = await this.bucket.createMultipartUpload(key, {
      httpMetadata: {
        contentType: options?.contentType,
        cacheControl: options?.cacheControl,
      },
      customMetadata: options?.metadata,
    })

    // Track upload for listMultipartUploads
    await this.bucket.put(
      `${MULTIPART_PREFIX}${upload.uploadId}.json`,
      JSON.stringify({ key: upload.key, uploadId: upload.uploadId, initiated: new Date().toISOString() }),
      { httpMetadata: { contentType: 'application/json' } }
    )

    return {
      uploadId: upload.uploadId,
      key: upload.key,
    }
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Uint8Array
  ): Promise<UploadPartResult> {
    const upload = this.bucket.resumeMultipartUpload(key, uploadId)
    const part = await upload.uploadPart(partNumber, body)

    // Track part for listParts
    await this.bucket.put(
      `${PARTS_PREFIX}${uploadId}/${partNumber}`,
      JSON.stringify({ partNumber: part.partNumber, etag: part.etag, size: body.length }),
      { httpMetadata: { contentType: 'application/json' } }
    )

    return {
      etag: part.etag,
      partNumber: part.partNumber,
    }
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[]
  ): Promise<CompleteMultipartResult> {
    const upload = this.bucket.resumeMultipartUpload(key, uploadId)
    const result = await upload.complete(
      parts.map((p) => ({
        partNumber: p.partNumber,
        etag: p.etag,
      }))
    )

    await this.cleanupTrackingObjects(uploadId)

    return {
      key: result.key,
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    const upload = this.bucket.resumeMultipartUpload(key, uploadId)
    await upload.abort()

    await this.cleanupTrackingObjects(uploadId)
  }

  async listParts(
    _key: string,
    uploadId: string,
    partNumberMarker?: string
  ): Promise<ListPartsResult> {
    const prefix = `${PARTS_PREFIX}${uploadId}/`
    const listed = await this.bucket.list({
      prefix,
      cursor: partNumberMarker,
    })

    const parts = await Promise.all(
      listed.objects.map(async (obj) => {
        const data = await this.bucket.get(obj.key)
        if (!data) {
          return null
        }
        return JSON.parse(await data.text()) as { partNumber: number; etag: string; size: number }
      })
    )

    const validParts = parts
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => a.partNumber - b.partNumber)

    return {
      parts: validParts,
      isTruncated: listed.truncated,
      nextPartNumberMarker: listed.truncated ? listed.cursor : undefined,
    }
  }

  async listMultipartUploads(
    keyMarker?: string,
    _uploadIdMarker?: string
  ): Promise<ListMultipartUploadsResult> {
    const listed = await this.bucket.list({
      prefix: MULTIPART_PREFIX,
      cursor: keyMarker,
    })

    const uploads = await Promise.all(
      listed.objects.map(async (obj) => {
        const data = await this.bucket.get(obj.key)
        if (!data) {
          return null
        }
        const parsed = JSON.parse(await data.text()) as { key: string; uploadId: string; initiated: string }
        return {
          key: parsed.key,
          uploadId: parsed.uploadId,
          initiated: new Date(parsed.initiated),
        }
      })
    )

    return {
      uploads: uploads.filter((u): u is NonNullable<typeof u> => u !== null),
      isTruncated: listed.truncated,
      nextKeyMarker: listed.truncated ? listed.cursor : undefined,
      nextUploadIdMarker: undefined,
    }
  }

  // ============================================
  // Private helpers
  // ============================================

  private async cleanupTrackingObjects(uploadId: string): Promise<void> {
    // Delete part tracking objects
    const partsPrefix = `${PARTS_PREFIX}${uploadId}/`
    let cursor: string | undefined
    const keysToDelete: string[] = []

    do {
      const listed = await this.bucket.list({ prefix: partsPrefix, cursor })
      for (const obj of listed.objects) {
        keysToDelete.push(obj.key)
      }
      cursor = listed.truncated ? listed.cursor : undefined
    } while (cursor)

    // Delete multipart tracking object
    keysToDelete.push(`${MULTIPART_PREFIX}${uploadId}.json`)

    if (keysToDelete.length > 0) {
      await this.bucket.delete(keysToDelete)
    }
  }
}
