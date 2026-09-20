import { Transient, inject } from 'stratal/di'
import {
  FileNotFoundError,
  STORAGE_TOKENS,
  type StorageManagerService,
  StorageService,
  type StreamingBlobPayloadInputTypes,
  type DownloadResult,
  type HeadResult,
  type ListOptions,
  type ListResult,
  type PresignedUrlResult,
  type StorageConfig,
  type UploadOptions,
  type UploadResult,
} from 'stratal/storage'
import { expect } from 'vitest'

/**
 * Objects per `list` page when a test does not ask for a size.
 *
 * One, so that any listing of two or more objects truncates and a caller who skips the `cursor`
 * loop fails here rather than against a real bucket.
 */
const FAKE_LIST_PAGE_SIZE = 1

/** Shared by `head` and `list` so a listed object and a headed one cannot drift apart. */
function toHeadResult(path: string, file: StoredFile): HeadResult {
  return {
    path,
    size: file.size,
    contentType: file.mimeType,
    uploadedAt: file.uploadedAt,
    metadata: file.metadata,
  }
}

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
   * Delete many files from fake storage
   */
  // `async` so an unconfigured disk arrives as a rejected promise, as it does from the real
  // service. Thrown synchronously it would slip past a caller that chains `.catch()` without
  // awaiting — a difference in error surface is still a difference the fake exists to avoid.
  async deleteMany(paths: string[], disk?: string): Promise<void> {
    this.resolveDisk(disk)

    for (const path of paths) {
      this.files.delete(path)
    }

    return Promise.resolve()
  }

  /**
   * Read a file's metadata from fake storage, without its contents
   */
  async head(path: string, disk?: string): Promise<HeadResult | null> {
    this.resolveDisk(disk)

    const file = this.files.get(path)
    if (!file) {
      return Promise.resolve(null)
    }

    return Promise.resolve(toHeadResult(path, file))
  }

  /**
   * List files in fake storage, one page at a time
   *
   * Truncates after ONE object unless `limit` says otherwise. Real R2 pages at 1000, but no
   * fixture stores 1000 files — matching that number would return everything in one page and let
   * a caller who never follows `cursor` pass every test, then undercount against a real bucket.
   * Paging at one means any listing of two or more objects exercises the loop.
   *
   * Pass `limit` to widen the page when a test is asserting page contents rather than the loop.
   */
  async list(options: ListOptions = {}, disk?: string): Promise<ListResult> {
    this.resolveDisk(disk)

    const prefix = options.prefix ?? ''
    // Sorted so pagination is deterministic — an unordered Map iteration would make `cursor`
    // meaningless and the page boundaries unrepeatable between runs.
    const matching = Array.from(this.files.keys())
      .filter((path) => path.startsWith(prefix))
      .sort()

    const start = options.cursor === undefined ? 0 : matching.indexOf(options.cursor)
    if (start < 0) {
      return Promise.reject(new Error(`Unknown storage list cursor: ${options.cursor ?? ''}`))
    }

    const limit = options.limit ?? FAKE_LIST_PAGE_SIZE
    const page = matching.slice(start, start + limit)
    const next = matching[start + limit]

    return Promise.resolve({
      objects: page.map((path) => {
        const object = toHeadResult(path, this.files.get(path)!)
        if (options.includeMetadata) {
          return object
        }

        // Dropped unless asked for, because R2 omits them unless asked for. A fake that always
        // returned them would let a caller read `contentType` off a listing in tests and find it
        // undefined against a real bucket.
        return { ...object, contentType: undefined, metadata: undefined }
      }),
      truncated: next !== undefined,
      cursor: next,
    })
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

    // Reuse the already-materialized bytes rather than `body`: a `ReadableStream`
    // is single-use, so reading it here and again inside `upload` would throw
    // "ReadableStream is disturbed". `content` is a Uint8Array and safe to re-read.
    return this.upload(content, path, { ...options, size }, disk)
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
