import { inject } from '../../di'
import { Singleton } from '../../di/decorators'
import { DI_TOKENS } from '../../di/tokens'
import { type StratalEnv } from '../../env'
import { LOGGER_TOKENS, type LoggerService } from '../../logger'
import { CACHE_TOKENS } from '../cache.tokens'
import { CacheError } from '../cache.error'

/**
 * Cache Service
 *
 * Type-safe wrapper around Cloudflare KV namespaces for caching operations.
 *
 * Reads are eventually consistent — KV may serve an edge-cached value for up to
 * ~60s after a write. When you need isolate-local read-after-write coherence
 * (e.g. set-once markers like queue idempotency keys), opt into
 * {@link TieredCacheService}, which layers an isolate-local L1 over this
 * service. Do **not** use the L1 tier for read-modify-write counters that need
 * cross-edge freshness (e.g. rate limiting) — plain KV is the correct primitive
 * there.
 *
 * **Features:**
 * - Mirrors all KVNamespace methods with full type safety
 * - Supports multiple KV bindings via `withBinding()` / `binding(name)`
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
 *   ) {
 *     // Initialize specialized caches in constructor
 *     this.uploadsCache = this.cache.binding('UPLOADS_CACHE')
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
@Singleton(CACHE_TOKENS.CacheService)
export class CacheService {
  private kv: KVNamespace

  constructor(
    @inject(DI_TOKENS.CloudflareEnv) private readonly env: StratalEnv,
    @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService
  ) {
    this.kv = env.CACHE
  }

  /** The KV namespace this instance is bound to. */
  get namespace(): KVNamespace {
    return this.kv
  }

  /**
   * Create a new CacheService instance bound to a different KV namespace.
   *
   * @param kv - KV namespace to use
   * @returns A new CacheService for the given binding
   */
  withBinding(kv: KVNamespace): CacheService {
    const instance = new CacheService(this.env, this.logger)
    instance.kv = kv
    return instance
  }

  /**
   * Create a new CacheService instance bound to a KV namespace by its binding
   * name, resolved from the environment.
   *
   * @param name - KV namespace binding name (e.g. `'UPLOADS_CACHE'`)
   * @returns A new CacheService for the given binding
   * @throws {CacheError} If no binding with that name exists in the environment
   */
  binding(name: string): CacheService {
    const kv = (this.env as unknown as Record<string, unknown>)[name] as KVNamespace | undefined
    if (!kv) {
      throw new CacheError(`KV binding "${name}" was not found in the environment`)
    }
    return this.withBinding(kv)
  }

  // ==================== GET METHODS ====================

  /**
   * Get a value from cache
   *
   * @param key - Cache key
   * @param typeOrOptions - Type string or options object (defaults to 'text')
   * @returns Value in specified type, or null if not found
   * @throws {CacheError} If operation fails
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
      throw new CacheError(`Failed to get cache key "${key}"`)
    }
  }

  // ==================== GET WITH METADATA METHODS ====================

  /**
   * Get a value with metadata from cache
   *
   * @param key - Cache key
   * @param typeOrOptions - Type string or options object (defaults to 'text')
   * @returns Object with value, metadata, and cacheStatus
   * @throws {CacheError} If operation fails
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
      throw new CacheError(`Failed to get cache key "${key}"`)
    }
  }

  // ==================== PUT METHOD ====================

  /**
   * Store a value in cache
   *
   * @param key - Cache key
   * @param value - Value to store (string, ArrayBuffer, ArrayBufferView, or ReadableStream)
   * @param options - Put options (expiration, expirationTtl, metadata)
   * @throws {CacheError} If operation fails
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
      throw new CacheError(`Failed to store cache key "${key}"`)
    }
  }

  // ==================== DELETE METHODS ====================

  /**
   * Delete a value from cache
   *
   * @param key - Cache key to delete
   * @throws {CacheError} If operation fails
   */
  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(key)
    } catch (error) {
      this.logger.error('Cache delete operation failed', { key, error })
      throw new CacheError(`Failed to delete cache key "${key}"`)
    }
  }


  // ==================== LIST METHOD ====================

  /**
   * List keys in cache
   *
   * @param options - List options (limit, prefix, cursor)
   * @returns List result with keys and pagination info
   * @throws {CacheError} If operation fails
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
      throw new CacheError('Failed to list cache keys')
    }
  }
}
