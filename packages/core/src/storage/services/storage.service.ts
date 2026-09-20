import { inject } from '../../di'
import { Request } from '../../di/decorators'
import type {
  DownloadResult,
  HeadResult,
  ListOptions,
  ListResult,
  PresignedUrlResult,
  UploadOptions,
  UploadResult,
} from '../contracts'
import { StorageError } from '../storage.error'
import type { StreamingBlobPayloadInputTypes } from '../providers/storage-provider.interface'
import { STORAGE_TOKENS } from '../storage.tokens'
import type { StorageConfig } from '../types'
import { type StorageManagerService } from './storage-manager.service'

/**
 * Storage Service
 *
 * Main facade for storage operations.
 * Request-scoped for proper isolation.
 *
 * @example
 * ```typescript
 * @inject(STORAGE_TOKENS.StorageService)
 * private readonly storage: StorageService
 *
 * await this.storage.upload(file, 'documents/report.pdf')
 * ```
 */
@Request(STORAGE_TOKENS.StorageService)
export class StorageService {
  constructor(
    @inject(STORAGE_TOKENS.StorageManager)
    protected readonly storageManager: StorageManagerService,
    @inject(STORAGE_TOKENS.Options)
    protected readonly options: StorageConfig
  ) { }

  /**
   * Upload content to storage
   * @param body - Content to upload (stream, buffer, or string)
   * @param relativePath - Relative path within the disk
   * @param options - Upload options including size and mime type
   * @param disk - Optional disk name (uses default if not provided)
   * @returns Upload result with metadata
   */
  async upload(
    body: StreamingBlobPayloadInputTypes,
    relativePath: string,
    options: UploadOptions,
    disk?: string
  ): Promise<UploadResult> {
    const diskName = this.resolveDisk(disk)
    const provider = await this.storageManager.getProvider(diskName)
    const fullPath = this.buildFullPath(relativePath, diskName)

    return provider.upload(body, fullPath, options)
  }

  /**
   * Download a file from storage
   * @param relativePath - Relative path within the disk
   * @param disk - Optional disk name (uses default if not provided)
   * @returns Download result with stream and metadata
   */
  async download(relativePath: string, disk?: string): Promise<DownloadResult> {
    const diskName = this.resolveDisk(disk)
    const provider = await this.storageManager.getProvider(diskName)
    const fullPath = this.buildFullPath(relativePath, diskName)

    return provider.download(fullPath)
  }

  /**
   * Delete a file from storage
   * @param relativePath - Relative path within the disk
   * @param disk - Optional disk name (uses default if not provided)
   */
  async delete(relativePath: string, disk?: string): Promise<void> {
    const diskName = this.resolveDisk(disk)
    const provider = await this.storageManager.getProvider(diskName)
    const fullPath = this.buildFullPath(relativePath, diskName)

    await provider.delete(fullPath)
  }

  /**
   * Check if a file exists in storage
   * @param relativePath - Relative path within the disk
   * @param disk - Optional disk name (uses default if not provided)
   * @returns True if file exists, false otherwise
   */
  async exists(relativePath: string, disk?: string): Promise<boolean> {
    const diskName = this.resolveDisk(disk)
    const provider = await this.storageManager.getProvider(diskName)
    const fullPath = this.buildFullPath(relativePath, diskName)

    return provider.exists(fullPath)
  }

  /**
   * Delete many files in one call
   *
   * Providers delete in bulk — R2 takes 1000 keys per round trip — so this costs a fraction of
   * the subrequests that looping over `delete` would. Paths that do not exist are ignored.
   *
   * @param relativePaths - Relative paths within the disk
   * @param disk - Optional disk name (uses default if not provided)
   */
  async deleteMany(relativePaths: string[], disk?: string): Promise<void> {
    if (relativePaths.length === 0) {
      return
    }

    const diskName = this.resolveDisk(disk)
    const provider = await this.storageManager.getProvider(diskName)

    await provider.deleteMany(relativePaths.map((path) => this.buildFullPath(path, diskName)))
  }

  /**
   * Read an object's metadata without transferring its body
   *
   * Use this to learn a file's size or content type when the contents are not needed — asking
   * `head` for a hundred objects costs a hundred metadata reads, where `download` would move a
   * hundred bodies.
   *
   * @param relativePath - Relative path within the disk
   * @param disk - Optional disk name (uses default if not provided)
   * @returns Metadata, or null when nothing exists at that path
   */
  async head(relativePath: string, disk?: string): Promise<HeadResult | null> {
    const diskName = this.resolveDisk(disk)
    const provider = await this.storageManager.getProvider(diskName)
    const fullPath = this.buildFullPath(relativePath, diskName)

    const result = await provider.head(fullPath)
    if (result === null) {
      return null
    }

    return { ...result, path: this.toRelativePath(result.path, diskName) }
  }

  /**
   * List objects on a disk, one page at a time
   *
   * **The result is a page, not the whole set.** Providers cap a single listing (R2 at 1000
   * objects), so anything that aggregates across a prefix — summing sizes, counting files,
   * copying a tree — must loop while `truncated` is true, passing `cursor` back in. Reading only
   * the first page yields an answer that is quietly too small, with nothing having failed.
   *
   * Returned paths are relative to the disk, so they can be passed straight to `download`,
   * `head` or `delete`.
   *
   * @param options - Prefix (relative to the disk), cursor and page limit
   * @param disk - Optional disk name (uses default if not provided)
   * @returns One page of matching objects
   */
  async list(options: ListOptions = {}, disk?: string): Promise<ListResult> {
    const diskName = this.resolveDisk(disk)
    const provider = await this.storageManager.getProvider(diskName)
    // An empty relative prefix still has to become the disk root, or a listing would escape the
    // disk and return every other disk's objects sharing the bucket.
    const fullPrefix = this.buildFullPath(options.prefix ?? '', diskName)

    const page = await provider.list({ ...options, prefix: fullPrefix })

    return {
      ...page,
      objects: page.objects.map((object) => ({
        ...object,
        path: this.toRelativePath(object.path, diskName),
      })),
    }
  }

  /**
   * Generate a presigned download URL
   * @param relativePath - Relative path within the disk
   * @param expiresIn - Optional expiry time in seconds (uses default if not provided)
   * @param disk - Optional disk name (uses default if not provided)
   * @returns Presigned URL result
   */
  async getPresignedDownloadUrl(
    relativePath: string,
    expiresIn?: number,
    disk?: string
  ): Promise<PresignedUrlResult> {
    return this.getPresignedUrl(relativePath, 'GET', expiresIn, disk)
  }

  /**
   * Generate a presigned upload URL
   * @param relativePath - Relative path within the disk
   * @param expiresIn - Optional expiry time in seconds (uses default if not provided)
   * @param disk - Optional disk name (uses default if not provided)
   * @returns Presigned URL result
   */
  async getPresignedUploadUrl(
    relativePath: string,
    expiresIn?: number,
    disk?: string
  ): Promise<PresignedUrlResult> {
    return this.getPresignedUrl(relativePath, 'PUT', expiresIn, disk)
  }

  /**
   * Generate a presigned delete URL
   * @param relativePath - Relative path within the disk
   * @param expiresIn - Optional expiry time in seconds (uses default if not provided)
   * @param disk - Optional disk name (uses default if not provided)
   * @returns Presigned URL result
   */
  async getPresignedDeleteUrl(
    relativePath: string,
    expiresIn?: number,
    disk?: string
  ): Promise<PresignedUrlResult> {
    return this.getPresignedUrl(relativePath, 'DELETE', expiresIn, disk)
  }

  /**
   * Generate a presigned URL for any method
   * @param relativePath - Relative path within the disk
   * @param method - HTTP method (GET, PUT, DELETE, HEAD)
   * @param expiresIn - Optional expiry time in seconds (uses default if not provided)
   * @param disk - Optional disk name (uses default if not provided)
   * @returns Presigned URL result
   */
  protected async getPresignedUrl(
    relativePath: string,
    method: 'GET' | 'PUT' | 'DELETE' | 'HEAD',
    expiresIn?: number,
    disk?: string
  ): Promise<PresignedUrlResult> {
    const diskName = this.resolveDisk(disk)
    const provider = await this.storageManager.getProvider(diskName)
    const fullPath = this.buildFullPath(relativePath, diskName)
    const validatedExpiresIn = this.validateExpiresIn(expiresIn)

    return provider.getPresignedUrl(fullPath, method, validatedExpiresIn)
  }

  /**
   * Resolve disk name (use default if not provided)
   * @param disk - Optional disk name
   * @returns Resolved disk name
   */
  protected resolveDisk(disk?: string): string {
    const diskName = disk ?? this.options.defaultStorageDisk

    if (!this.storageManager.hasDisk(diskName)) {
      throw new StorageError(`Disk "${diskName}" is not configured`)
    }

    return diskName
  }

  /**
   * Build full path with disk root and path template substitution
   * @param relativePath - Relative path within the disk
   * @param diskName - Name of the disk
   * @returns Full path including disk root
   */
  protected buildFullPath(relativePath: string, diskName: string): string {
    const diskConfig = this.storageManager.getDiskConfig(diskName)
    let root = diskConfig.root || ''

    // Substitute template variables
    root = this.substituteTemplateVariables(root)

    // Combine root and relative path
    const fullPath = `${root}/${relativePath}`.replace(/\/+/g, '/').replace(/^\//, '')

    return fullPath
  }

  /**
   * Strip the disk root from a provider path
   *
   * The inverse of `buildFullPath`, so what `head`/`list` hand back is what `download`/`delete`
   * accept. A path that does not start with the root is returned unchanged rather than mangled —
   * that can only happen if a provider returned something outside the disk, and silently trimming
   * a prefix off it would disguise the fault as a valid path.
   *
   * @param fullPath - Path as the provider reported it
   * @param diskName - Name of the disk
   * @returns Path relative to the disk root
   */
  protected toRelativePath(fullPath: string, diskName: string): string {
    const root = this.buildFullPath('', diskName)
    if (root === '' || !fullPath.startsWith(root)) {
      return fullPath
    }

    return fullPath.slice(root.length).replace(/^\//, '')
  }

  /**
   * Substitute template variables in path
   * Override this method in subclasses to add custom substitutions
   *
   * @param path - Path with template variables
   * @returns Path with substituted variables
   */
  protected substituteTemplateVariables(path: string): string {
    let result = path

    // Substitute {date}, {year}, {month}
    const now = new Date()
    result = result.replace(/{date}/g, now.toISOString().split('T')[0])
    result = result.replace(/{year}/g, now.getFullYear().toString())
    result = result.replace(/{month}/g, (now.getMonth() + 1).toString().padStart(2, '0'))

    return result
  }

  /**
   * Validate expiry time for presigned URLs
   * @param expiresIn - Optional expiry time in seconds
   * @returns Validated expiry time
   */
  protected validateExpiresIn(expiresIn?: number): number {
    const presignedUrlConfig = this.options.presignedUrl
    const validatedExpiresIn = expiresIn ?? presignedUrlConfig.defaultExpiry

    const minExpiry = 1
    const maxExpiry = presignedUrlConfig.maxExpiry

    if (validatedExpiresIn < minExpiry || validatedExpiresIn > maxExpiry) {
      throw new StorageError(`Presigned URL expiry ${validatedExpiresIn}s is out of range (${minExpiry}–${maxExpiry}s)`)
    }

    return validatedExpiresIn
  }

  /**
   * Get all available disk names
   * @returns Array of disk names
   */
  getAvailableDisks(): string[] {
    return this.storageManager.getAvailableDisks()
  }

  /**
   * Chunked upload for streaming data without known size
   * Uses multipart upload under the hood - handles retries and large files
   *
   * Use this method when:
   * - Content-Length is unknown or unreliable
   * - Uploading from streams that can't be rewound
   * - Need automatic retry handling for transient failures
   *
   * @param body - Content to upload (stream or buffer)
   * @param relativePath - Relative path within the disk
   * @param options - Upload options (mimeType required, size optional)
   * @param disk - Optional disk name (uses default if not provided)
   * @returns Upload result with metadata
   */
  async chunkedUpload(
    body: StreamingBlobPayloadInputTypes,
    relativePath: string,
    options: Omit<UploadOptions, 'size'> & { size?: number },
    disk?: string
  ): Promise<UploadResult> {
    const diskName = this.resolveDisk(disk)
    const provider = await this.storageManager.getProvider(diskName)
    const fullPath = this.buildFullPath(relativePath, diskName)

    return provider.chunkedUpload(body, fullPath, options)
  }
}
