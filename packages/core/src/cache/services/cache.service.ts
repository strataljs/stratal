import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import { DI_TOKENS } from '../../di/tokens'
import { type StratalEnv } from '../../env'
import { LOGGER_TOKENS, type LoggerService } from '../../logger'
import { CACHE_TOKENS } from '../cache.tokens'
import {
  CacheDeleteError,
  CacheGetError,
  CacheListError,
  CachePutError,
} from '../errors'

/**
 * Cache Service
 *
 * Type-safe wrapper around Cloudflare KV namespaces for caching operations.
 *
 * **Features:**
 * - Mirrors all KVNamespace methods with full type safety
 * - Supports multiple KV bindings via `withBinding()`
 * - Automatic error handling with logging
 * - Security: Raw errors are logged, not exposed to users
 *
 * **Usage:**
 * ```typescript
 * class MyService {
 *   private readonly uploadsCache: CacheService
 *
 *   constructor(
 *     @inject(CACHE_TOKENS.CacheService) private readonly cache: CacheService,
 *     @inject(DI_TOKENS.CloudflareEnv) private readonly env: Env
 *   ) {
 *     // Initialize specialized caches in constructor
 *     this.uploadsCache = this.cache.withBinding(this.env.UPLOADS_CACHE)
 *   }
 *
 *   async cacheData(key: string, value: string) {
 *     await this.cache.put(key, value, { expirationTtl: 3600 })
 *     await this.uploadsCache.put(`upload:${key}`, value)
 *   }
 * }
 * ```
 *
 * @see https://developers.cloudflare.com/kv/api/
 */
@Transient(CACHE_TOKENS.CacheService)
export class CacheService {
  private kv: KVNamespace

  constructor(
    @inject(DI_TOKENS.CloudflareEnv) private readonly env: StratalEnv,
    @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService
  ) {
    this.kv = env.CACHE
  }

  /**
   * Set the KV namespace binding
   *
   * Used internally by `withBinding()` to configure different KV instances.
   *
   * @param kv - KV namespace to use
   */
  setKV(kv: KVNamespace): void {
    this.kv = kv
  }

  /**
   * Create a new CacheService instance with a different KV binding
   *
   * **Pattern:** Returns a new instance (immutable)
   *
   * **Best Practice:** Initialize specialized caches as class properties in constructor
   *
   * @example
   * ```typescript
   * class MyService {
   *   private readonly uploadsCache: CacheService
   *   private readonly systemCache: CacheService
   *
   *   constructor(
   *     @inject(CACHE_TOKENS.CacheService) private readonly cache: CacheService,
   *     @inject(DI_TOKENS.CloudflareEnv) private readonly env: Env
   *   ) {
   *     this.uploadsCache = this.cache.withBinding(this.env.UPLOADS_CACHE)
   *     this.systemCache = this.cache.withBinding(this.env.SYSTEM_CONFIG_KV)
   *   }
   * }
   * ```
   *
   * @param kv - KV namespace to use
   * @returns New CacheService instance with the specified binding
   */
  withBinding(kv: KVNamespace): CacheService {
    const instance = new CacheService(this.env, this.logger)
    instance.setKV(kv)
    return instance
  }

  // ==================== GET METHODS ====================

  /**
   * Get a value from cache
   *
   * @param key - Cache key
   * @param typeOrOptions - Type string or options object (defaults to 'text')
   * @returns Value in specified type, or null if not found
   * @throws {CacheGetError} If operation fails
   */
  async get(key: string, typeOrOptions?: 'text' | KVNamespaceGetOptions<'text'>): Promise<string | null>
  async get<ExpectedValue = unknown>(key: string, typeOrOptions: 'json' | KVNamespaceGetOptions<'json'>): Promise<ExpectedValue | null>
  async get(key: string, typeOrOptions: 'arrayBuffer' | KVNamespaceGetOptions<'arrayBuffer'>): Promise<ArrayBuffer | null>
  async get(key: string, typeOrOptions: 'stream' | KVNamespaceGetOptions<'stream'>): Promise<ReadableStream | null>

  async get<ExpectedValue = unknown>(
    key: string,
    typeOrOptions?: string | KVNamespaceGetOptions<'text' | 'json' | 'arrayBuffer' | 'stream'>
  ): Promise<string | ExpectedValue | ArrayBuffer | ReadableStream | null> {
    try {
      if (typeof typeOrOptions === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- bridging KV overloaded API
        return await this.kv.get(key, typeOrOptions as any)
      }

      if (typeOrOptions) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- bridging KV overloaded API
        return await this.kv.get(key, typeOrOptions as any)
      }

      return await this.kv.get(key)
    } catch (error) {
      this.logger.error('Cache get operation failed', { key, error })
      throw new CacheGetError(key)
    }
  }

  // ==================== GET WITH METADATA METHODS ====================

  /**
   * Get a value with metadata from cache
   *
   * @param key - Cache key
   * @param typeOrOptions - Type string or options object (defaults to 'text')
   * @returns Object with value, metadata, and cacheStatus
   * @throws {CacheGetError} If operation fails
   */
  async getWithMetadata<Metadata = unknown>(
    key: string,
    typeOrOptions?: 'text' | KVNamespaceGetOptions<'text'>
  ): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>
  async getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
    key: string,
    typeOrOptions: 'json' | KVNamespaceGetOptions<'json'>
  ): Promise<KVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>
  async getWithMetadata<Metadata = unknown>(
    key: string,
    typeOrOptions: 'arrayBuffer' | KVNamespaceGetOptions<'arrayBuffer'>
  ): Promise<KVNamespaceGetWithMetadataResult<ArrayBuffer, Metadata>>
  async getWithMetadata<Metadata = unknown>(
    key: string,
    typeOrOptions: 'stream' | KVNamespaceGetOptions<'stream'>
  ): Promise<KVNamespaceGetWithMetadataResult<ReadableStream, Metadata>>

  async getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
    key: string,
    typeOrOptions?: string | KVNamespaceGetOptions<'text' | 'json' | 'arrayBuffer' | 'stream'>
  ): Promise<
    KVNamespaceGetWithMetadataResult<
      string | ExpectedValue | ArrayBuffer | ReadableStream,
      Metadata
    >
  > {
    try {
      if (typeof typeOrOptions === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- bridging KV overloaded API
        return await this.kv.getWithMetadata(key, typeOrOptions as any)
      }

      if (typeOrOptions) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- bridging KV overloaded API
        return await this.kv.getWithMetadata(key, typeOrOptions as any)
      }

      return await this.kv.getWithMetadata(key)
    } catch (error) {
      this.logger.error('Cache getWithMetadata operation failed', { key, error })
      throw new CacheGetError(key)
    }
  }

  // ==================== PUT METHOD ====================

  /**
   * Store a value in cache
   *
   * @param key - Cache key
   * @param value - Value to store (string, ArrayBuffer, ArrayBufferView, or ReadableStream)
   * @param options - Put options (expiration, expirationTtl, metadata)
   * @throws {CachePutError} If operation fails
   *
   * @example
   * ```typescript
   * // Simple put
   * await cache.put('key', 'value')
   *
   * // With TTL
   * await cache.put('key', 'value', { expirationTtl: 3600 })
   *
   * // With metadata
   * await cache.put('key', 'value', { metadata: { created: Date.now() } })
   * ```
   */
  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: KVNamespacePutOptions
  ): Promise<void> {
    try {
      await this.kv.put(key, value as string, options)
    } catch (error) {
      this.logger.error('Cache put operation failed', { key, error })
      throw new CachePutError(key)
    }
  }

  // ==================== DELETE METHODS ====================

  /**
   * Delete a value from cache
   *
   * @param key - Cache key to delete
   * @throws {CacheDeleteError} If operation fails
   */
  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(key)
    } catch (error) {
      this.logger.error('Cache delete operation failed', { key, error })
      throw new CacheDeleteError(key)
    }
  }


  // ==================== LIST METHOD ====================

  /**
   * List keys in cache
   *
   * @param options - List options (limit, prefix, cursor)
   * @returns List result with keys and pagination info
   * @throws {CacheListError} If operation fails
   *
   * @example
   * ```typescript
   * // List all keys
   * const result = await cache.list()
   *
   * // List with prefix
   * const result = await cache.list({ prefix: 'user:' })
   *
   * // Paginated list
   * const result = await cache.list({ limit: 100 })
   * if (!result.list_complete) {
   *   const nextPage = await cache.list({ cursor: result.cursor })
   * }
   * ```
   */
  async list<Metadata = unknown>(
    options?: KVNamespaceListOptions
  ): Promise<KVNamespaceListResult<Metadata>> {
    try {
      return await this.kv.list<Metadata>(options)
    } catch (error) {
      this.logger.error('Cache list operation failed', { options, error })
      throw new CacheListError()
    }
  }
}
