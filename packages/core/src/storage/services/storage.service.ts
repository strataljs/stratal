import '../../polyfills'

import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import type { DownloadResult, PresignedUrlResult, UploadOptions, UploadResult } from '../contracts'
import {
  InvalidDiskError,
  PresignedUrlInvalidExpiryError,
} from '../errors'
import type { StreamingBlobPayloadInputTypes } from '../providers/storage-provider.interface'
import { STORAGE_TOKENS } from '../storage.tokens'
import type { StorageConfig } from '../types'
import { StorageManagerService } from './storage-manager.service'

/**
 * Storage Service
 *
 * Main facade for storage operations.
 * Request-scoped for proper isolation.
 *
 * This service is tenant-agnostic. For tenant-aware path resolution,
 * use TenantStorageService from the tenant module.
 *
 * @example
 * ```typescript
 * @inject(STORAGE_TOKENS.StorageService)
 * private readonly storage: StorageService
 *
 * await this.storage.upload(file, 'documents/report.pdf')
 * ```
 */
@Transient(STORAGE_TOKENS.StorageService)
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
    const provider = this.storageManager.getProvider(diskName)
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
    const provider = this.storageManager.getProvider(diskName)
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
    const provider = this.storageManager.getProvider(diskName)
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
    const provider = this.storageManager.getProvider(diskName)
    const fullPath = this.buildFullPath(relativePath, diskName)

    return provider.exists(fullPath)
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
    const provider = this.storageManager.getProvider(diskName)
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
      throw new InvalidDiskError(diskName)
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
   * Substitute template variables in path
   * Override this method in subclasses to add tenant-specific substitutions
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

    // S3 presigned URL limits: 1 second to 7 days (604800 seconds)
    const minExpiry = 1
    const maxExpiry = presignedUrlConfig.maxExpiry

    if (validatedExpiresIn < minExpiry || validatedExpiresIn > maxExpiry) {
      throw new PresignedUrlInvalidExpiryError(validatedExpiresIn, minExpiry, maxExpiry)
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
    const provider = this.storageManager.getProvider(diskName)
    const fullPath = this.buildFullPath(relativePath, diskName)

    return provider.chunkedUpload(body, fullPath, options)
  }
}
