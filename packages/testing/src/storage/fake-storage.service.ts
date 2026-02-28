import { Transient, inject } from 'stratal/di'
import {
  FileNotFoundError,
  STORAGE_TOKENS,
  StorageManagerService,
  StorageService,
  StreamingBlobPayloadInputTypes,
  type DownloadResult,
  type PresignedUrlResult,
  type StorageConfig,
  type UploadOptions,
  type UploadResult,
} from 'stratal/storage'
import { expect } from 'vitest'

/**
 * Stored file representation in memory
 */
export interface StoredFile {
  content: Uint8Array
  mimeType: string
  size: number
  metadata?: Record<string, string>
  uploadedAt: Date
}

/**
 * FakeStorageService
 *
 * In-memory storage implementation for testing.
 * Registered by default in TestingModuleBuilder.
 *
 * Similar to Laravel's Storage::fake() - stores files in memory
 * and provides assertion helpers for testing.
 *
 * @example
 * ```typescript
 * // Access via TestingModule
 * module.storage.assertExists('path/to/file.pdf')
 * module.storage.assertMissing('deleted/file.pdf')
 * module.storage.clear() // Reset between tests
 * ```
 */
@Transient(STORAGE_TOKENS.StorageService)
export class FakeStorageService extends StorageService {
  private files = new Map<string, StoredFile>()

  constructor(
    @inject(STORAGE_TOKENS.StorageManager)
    protected readonly storageManager: StorageManagerService,
    @inject(STORAGE_TOKENS.Options)
    protected readonly options: StorageConfig
  ) {
    super(storageManager, options)
  }

  /**
   * Upload content to fake storage
   */
  async upload(
    body: StreamingBlobPayloadInputTypes,
    relativePath: string,
    options: UploadOptions,
    disk?: string
  ): Promise<UploadResult> {
    const content = await this.bodyToUint8Array(body)
    const diskName = this.resolveDisk(disk)

    this.files.set(relativePath, {
      content,
      mimeType: options.mimeType ?? 'application/octet-stream',
      size: options.size,
      metadata: options.metadata,
      uploadedAt: new Date(),
    })

    return {
      path: relativePath,
      disk: diskName,
      fullPath: relativePath,
      size: options.size,
      mimeType: options.mimeType ?? 'application/octet-stream',
      uploadedAt: new Date(),
    }
  }

  /**
   * Download a file from fake storage
   */
  download(path: string): Promise<DownloadResult> {
    const file = this.files.get(path)

    if (!file) {
      return Promise.reject(new FileNotFoundError(path))
    }

    return Promise.resolve({
      toStream: () => new ReadableStream({
        start(controller) {
          controller.enqueue(file.content)
          controller.close()
        },
      }),
      toString: () => Promise.resolve(new TextDecoder().decode(file.content)),
      toArrayBuffer: () => Promise.resolve(file.content),
      contentType: file.mimeType,
      size: file.size,
      metadata: file.metadata,
    })
  }

  /**
   * Delete a file from fake storage
   */
  delete(path: string): Promise<void> {
    this.files.delete(path)
    return Promise.resolve()
  }

  /**
   * Check if a file exists in fake storage
   */
  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path))
  }

  /**
   * Generate a fake presigned download URL
   */
  getPresignedDownloadUrl(
    path: string,
    expiresIn?: number
  ): Promise<PresignedUrlResult> {
    return Promise.resolve(this.createPresignedUrl(path, 'GET', expiresIn))
  }

  /**
   * Generate a fake presigned upload URL
   */
  getPresignedUploadUrl(
    path: string,
    expiresIn?: number
  ): Promise<PresignedUrlResult> {
    return Promise.resolve(this.createPresignedUrl(path, 'PUT', expiresIn))
  }

  /**
   * Generate a fake presigned delete URL
   */
  getPresignedDeleteUrl(
    path: string,
    expiresIn?: number
  ): Promise<PresignedUrlResult> {
    return Promise.resolve(this.createPresignedUrl(path, 'DELETE', expiresIn))
  }

  /**
   * Chunked upload (same as regular upload for fake)
   */
  async chunkedUpload(
    body: StreamingBlobPayloadInputTypes,
    path: string,
    options: Omit<UploadOptions, 'size'> & { size?: number },
    disk?: string
  ): Promise<UploadResult> {
    const content = await this.bodyToUint8Array(body)
    const size = options.size ?? content.length

    return this.upload(body, path, { ...options, size }, disk)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test Assertion Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Assert that a file exists at the given path
   *
   * @param path - Path to check
   * @throws AssertionError if file does not exist
   */
  assertExists(path: string): void {
    expect(
      this.files.has(path),
      `Expected file to exist at: ${path}\nStored files: ${this.getStoredPaths().join(', ') || '(none)'}`
    ).toBe(true)
  }

  /**
   * Assert that a file does NOT exist at the given path
   *
   * @param path - Path to check
   * @throws AssertionError if file exists
   */
  assertMissing(path: string): void {
    expect(
      this.files.has(path),
      `Expected file NOT to exist at: ${path}`
    ).toBe(false)
  }

  /**
   * Assert storage is empty
   *
   * @throws AssertionError if any files exist
   */
  assertEmpty(): void {
    expect(
      this.files.size,
      `Expected storage to be empty but found ${this.files.size} files: ${this.getStoredPaths().join(', ')}`
    ).toBe(0)
  }

  /**
   * Assert storage has exactly N files
   *
   * @param count - Expected number of files
   * @throws AssertionError if count doesn't match
   */
  assertCount(count: number): void {
    expect(
      this.files.size,
      `Expected ${count} files in storage but found ${this.files.size}`
    ).toBe(count)
  }

  /**
   * Get all stored files (for inspection)
   */
  getStoredFiles(): Map<string, StoredFile> {
    return new Map(this.files)
  }

  /**
   * Get all stored file paths
   */
  getStoredPaths(): string[] {
    return Array.from(this.files.keys())
  }

  /**
   * Get a specific file by path
   */
  getFile(path: string): StoredFile | undefined {
    return this.files.get(path)
  }

  /**
   * Clear all stored files (call in beforeEach for test isolation)
   */
  clear(): void {
    this.files.clear()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private createPresignedUrl(
    path: string,
    method: 'GET' | 'PUT' | 'DELETE' | 'HEAD',
    expiresIn = 300
  ): PresignedUrlResult {
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    return {
      url: `https://fake-storage.test/${path}?method=${method}&expires=${expiresAt.toISOString()}`,
      expiresIn,
      expiresAt,
      method,
    }
  }

  private async bodyToUint8Array(body: StreamingBlobPayloadInputTypes | null | undefined): Promise<Uint8Array> {
    if (!body) {
      return new Uint8Array(0)
    }

    if (body instanceof Uint8Array) {
      return body
    }

    if (body instanceof ArrayBuffer) {
      return new Uint8Array(body)
    }

    if (typeof body === 'string') {
      return new TextEncoder().encode(body)
    }

    if (body instanceof Blob) {
      const buffer = await body.arrayBuffer()
      return new Uint8Array(buffer)
    }

    if (body instanceof ReadableStream) {
      return new Uint8Array(await new Response(body).arrayBuffer())
    }

    // FormData or URLSearchParams - convert via Response
    if (body instanceof FormData || body instanceof URLSearchParams) {
      return new Uint8Array(await new Response(body).arrayBuffer())
    }

    return new Uint8Array(0)
  }
}
