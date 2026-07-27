import { inject } from '../../di'
import { Singleton } from '../../di/decorators'
import { CACHE_TOKENS } from '../cache.tokens'
import type { CacheService } from './cache.service'

/** A value held in the isolate-local L1 tier. */
interface L1Entry {
  /** The raw string value, exactly as it is (or would be) stored in KV. */
  value: string
  /** Absolute expiry in epoch milliseconds, or `null` for no expiry. */
  expiresAt: number | null
}

/**
 * Max entries kept in the isolate-local L1 before the oldest is evicted (FIFO).
 * Bounds memory per isolate; KV remains the unbounded source of truth.
 */
const L1_MAX_ENTRIES = 1000

/**
 * Tiered Cache Service
 *
 * Layers an **isolate-local in-memory L1** over {@link CacheService} (KV, the
 * L2). Opt-in — inject `CACHE_TOKENS.TieredCacheService` instead of
 * `CACHE_TOKENS.CacheService` when you want it.
 *
 * **Why:** KV reads are eventually consistent (a `get` can return an
 * edge-cached value for up to ~60s after a `put`). The L1 makes writes made
 * through *this isolate* immediately and consistently visible to subsequent
 * reads on the same isolate — closing the read-after-write gap KV alone cannot.
 * This is what makes set-once patterns (e.g. queue idempotency markers) reliable
 * within an isolate, even inside KV's consistency window.
 *
 * **Use it for:** set-once / read-mostly values (idempotency claims, immutable
 * lookups). **Do not use it for** read-modify-write counters that need
 * cross-edge freshness (e.g. rate limiting): an isolate that wrote a key reads
 * its own value until the L1 entry expires, so concurrent increments from other
 * isolates are missed and overwritten. Use plain {@link CacheService} (KV) or a
 * Durable-Object store for those.
 *
 * **Semantics:**
 * - L1 caches string-backed values only (`text`/`json`). `arrayBuffer`/`stream`
 *   reads and non-string writes bypass and invalidate L1.
 * - `put`/`delete` are write-through: KV and L1 update in lock-step, honoring
 *   `expirationTtl`/`expiration` for the L1 entry's own expiry.
 * - `get` populates L1 from `text` reads (the only path that yields the raw
 *   string). `json` reads are served from L1 when the string was cached by a
 *   prior `put`/`text` read, otherwise they go straight to KV.
 * - `getWithMetadata` and `list` always read KV directly (metadata is not held
 *   in L1).
 *
 * **Cross-isolate caveat:** the L1 only observes writes made through its own
 * isolate. A value mutated by another isolate is not seen until the local entry
 * expires or is invalidated by a local write/delete.
 *
 * **Bindings:** `binding(name)` returns a memoized tiered instance per binding,
 * so each KV namespace has its own stable, isolate-lifetime L1.
 */
@Singleton(CACHE_TOKENS.TieredCacheService)
export class TieredCacheService {
  /** Isolate-local L1 tier. Per-instance, so each binding has its own. */
  private readonly l1 = new Map<string, L1Entry>()
  /** Memoized tiered instances per binding name (each with its own L1). */
  private readonly children = new Map<string, TieredCacheService>()

  constructor(
    @inject(CACHE_TOKENS.CacheService) private readonly cache: CacheService
  ) {}

  /**
   * Get the tiered cache bound to a KV namespace by its binding name. Memoized:
   * repeated calls with the same name return the same instance, preserving its
   * isolate-local L1 across requests/messages.
   *
   * @param name - KV namespace binding name (e.g. `'UPLOADS_CACHE'`)
   * @throws {CacheError} If no binding with that name exists in the environment
   */
  binding(name: string): TieredCacheService {
    let child = this.children.get(name)
    if (child === undefined) {
      child = new TieredCacheService(this.cache.binding(name))
      this.children.set(name, child)
    }
    return child
  }

  // ==================== GET ====================

  async get(key: string, typeOrOptions?: 'text' | KVNamespaceGetOptions<'text'>): Promise<string | null>
  async get<ExpectedValue = unknown>(key: string, typeOrOptions: 'json' | KVNamespaceGetOptions<'json'>): Promise<ExpectedValue | null>
  async get(key: string, typeOrOptions: 'arrayBuffer' | KVNamespaceGetOptions<'arrayBuffer'>): Promise<ArrayBuffer | null>
  async get(key: string, typeOrOptions: 'stream' | KVNamespaceGetOptions<'stream'>): Promise<ReadableStream | null>

  async get<ExpectedValue = unknown>(
    key: string,
    typeOrOptions?: string | KVNamespaceGetOptions<'text' | 'json' | 'arrayBuffer' | 'stream'>
  ): Promise<string | ExpectedValue | ArrayBuffer | ReadableStream | null> {
    const type = typeof typeOrOptions === 'string'
      ? typeOrOptions
      : typeOrOptions?.type ?? 'text'

    // L1 holds string-backed values only. Serve text/json from it when present.
    if (type === 'text' || type === 'json') {
      const cached = this.l1Read(key)
      if (cached !== null) {
        return type === 'json' ? (JSON.parse(cached) as ExpectedValue) : cached
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- bridging the typed CacheService.get overloads
    const value = await this.cache.get<ExpectedValue>(key, typeOrOptions as any)

    // Only `text` reads yield the raw string we can cache; back-populate L1.
    if (type === 'text' && typeof value === 'string') {
      this.l1Write(key, value, null)
    }

    return value
  }

  // ==================== GET WITH METADATA (KV-direct) ====================

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- bridging the typed CacheService.getWithMetadata overloads
    return this.cache.getWithMetadata<ExpectedValue, Metadata>(key, typeOrOptions as any)
  }

  // ==================== PUT (write-through) ====================

  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: KVNamespacePutOptions
  ): Promise<void> {
    await this.cache.put(key, value, options)
    this.writeThroughL1(key, value, options)
  }

  /**
   * Write-through put that **awaits the durable L2 write** (throwing on
   * failure) while keeping the isolate-local L1 in lock-step. Use for set-once
   * values whose loss would be a correctness bug — queue idempotency claims,
   * failed-job records. The deferred {@link put} is for best-effort caching.
   *
   * @throws {CacheError} If the KV write fails.
   */
  async putDurable(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: KVNamespacePutOptions
  ): Promise<void> {
    await this.cache.putDurable(key, value, options)
    this.writeThroughL1(key, value, options)
  }

  /**
   * Mirror a write into the isolate-local L1: cache string values; drop the
   * entry for binary values, which L1 does not hold.
   */
  private writeThroughL1(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: KVNamespacePutOptions
  ): void {
    if (typeof value === 'string') {
      this.l1Write(key, value, this.l1ExpiresAt(options))
    } else {
      this.l1.delete(key)
    }
  }

  // ==================== DELETE (write-through) ====================

  async delete(key: string): Promise<void> {
    await this.cache.delete(key)
    this.l1.delete(key)
  }

  // ==================== LIST (KV-direct) ====================

  async list<Metadata = unknown>(
    options?: KVNamespaceListOptions
  ): Promise<KVNamespaceListResult<Metadata>> {
    return this.cache.list<Metadata>(options)
  }

  // ==================== L1 TIER ====================

  /** Read a fresh L1 entry, evicting it if expired. Returns `null` on miss. */
  private l1Read(key: string): string | null {
    const entry = this.l1.get(key)
    if (entry === undefined) return null
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.l1.delete(key)
      return null
    }
    return entry.value
  }

  /** Write an L1 entry, refreshing its recency and evicting the oldest at cap. */
  private l1Write(key: string, value: string, expiresAt: number | null): void {
    // Re-insert so the most recently written key is youngest in iteration order.
    this.l1.delete(key)
    if (this.l1.size >= L1_MAX_ENTRIES) {
      const oldest = this.l1.keys().next().value
      if (oldest !== undefined) this.l1.delete(oldest)
    }
    this.l1.set(key, { value, expiresAt })
  }

  /** Compute an absolute L1 expiry (epoch ms) from KV put options. */
  private l1ExpiresAt(options?: KVNamespacePutOptions): number | null {
    if (options?.expiration !== undefined) return options.expiration * 1000
    if (options?.expirationTtl !== undefined) return Date.now() + options.expirationTtl * 1000
    return null
  }
}
