import { inject } from '../di';
import { Transient } from '../di/decorators';
import { CACHE_TOKENS } from '../cache/cache.tokens';
import type { TieredCacheService } from '../cache/services/tiered-cache.service';
import type { FailedJob, FailedJobMetadata } from './failed-job';
import type { QueueModuleOptions } from './queue.module';
import { QUEUE_TOKENS } from './queue.tokens';

const IDEM_PREFIX = 'queue:idem:'
const FAILED_PREFIX = 'queue:failed:'
const DEFAULT_IDEMPOTENCY_TTL = 86400

/** Default KV binding name used for queue state when none is configured. */
export const DEFAULT_STORE_BINDING = 'CACHE'

/**
 * Persists queue idempotency claims and failed jobs.
 *
 * Backed by {@link TieredCacheService} (isolate-local L1 + KV). The L1 is what
 * makes `markProcessed` → `isProcessed` reliable within an isolate: a claim
 * written on this isolate is read back from memory, so a message redelivered to
 * the same warm isolate is de-duplicated even inside KV's eventual-consistency
 * window. Idempotency markers are set-once, the pattern the L1 tier is designed
 * for. Cross-isolate duplicates still rely on KV (eventually consistent) —
 * delivery remains at-least-once with best-effort de-duplication, not
 * exactly-once.
 */
@Transient(QUEUE_TOKENS.QueueStore)
export class QueueStore {
  private readonly cache: TieredCacheService
  private readonly idempotencyTtl: number

  constructor(
    @inject(CACHE_TOKENS.TieredCacheService) cache: TieredCacheService,
    @inject(QUEUE_TOKENS.QueueModuleOptions) options: QueueModuleOptions,
  ) {
    // Bind to the configured KV namespace via the tiered cache so the L1 lives
    // on its singleton (one per isolate) and persists across messages. The
    // binding is validated at module init (QueueModule.onInitialize);
    // `binding()` also throws if it is somehow absent here.
    this.cache = cache.binding(options.store?.binding ?? DEFAULT_STORE_BINDING)
    this.idempotencyTtl = options.idempotency?.ttl ?? DEFAULT_IDEMPOTENCY_TTL
  }

  async isProcessed(key: string): Promise<boolean> {
    return (await this.cache.get(`${IDEM_PREFIX}${key}`)) !== null
  }

  async markProcessed(key: string): Promise<void> {
    await this.cache.put(`${IDEM_PREFIX}${key}`, '1', {
      expirationTtl: this.idempotencyTtl,
    })
  }

  async storeFailedJob(job: FailedJob): Promise<void> {
    const metadata: FailedJobMetadata = {
      queue: job.queue,
      binding: job.binding,
      type: job.type,
      consumer: job.consumer,
      attempts: job.attempts,
      failedAt: job.failedAt,
    }

    await this.cache.put(`${FAILED_PREFIX}${job.id}`, JSON.stringify(job), {
      metadata,
    })
  }

  async getFailedJob(messageId: string): Promise<FailedJob | null> {
    return this.cache.get<FailedJob>(`${FAILED_PREFIX}${messageId}`, 'json')
  }

  async removeFailedJob(messageId: string): Promise<void> {
    await this.cache.delete(`${FAILED_PREFIX}${messageId}`)
  }

  async listFailedJobs(options?: {
    limit?: number
    cursor?: string
  }): Promise<{ keys: { id: string; metadata: FailedJobMetadata }[]; cursor?: string }> {
    const result = await this.cache.list<FailedJobMetadata>({
      prefix: FAILED_PREFIX,
      limit: options?.limit ?? 50,
      cursor: options?.cursor,
    })

    // Skip keys without metadata: a partially-written entry (or one written by
    // an older code path) is unusable for listing and must not crash the page.
    const keys = result.keys
      .filter((key): key is typeof key & { metadata: FailedJobMetadata } => key.metadata != null)
      .map((key) => ({
        id: key.name.slice(FAILED_PREFIX.length),
        metadata: key.metadata,
      }))

    return {
      keys,
      cursor: result.list_complete ? undefined : result.cursor,
    }
  }

  async purgeFailedJobs(): Promise<void> {
    let cursor: string | undefined

    do {
      const result = await this.cache.list({ prefix: FAILED_PREFIX, cursor })
      await Promise.all(result.keys.map((key) => this.cache.delete(key.name)))
      cursor = result.list_complete ? undefined : result.cursor
    } while (cursor)
  }

  /**
   * Delete failed jobs older than `retentionSeconds` (by their `failedAt`
   * timestamp). Returns the number removed. Backs the opt-in
   * {@link FailedJobCleanupJob} cron — failed jobs otherwise persist
   * indefinitely until retried or purged.
   */
  async purgeFailedJobsOlderThan(retentionSeconds: number): Promise<number> {
    const cutoff = Date.now() - retentionSeconds * 1000
    let cursor: string | undefined
    let removed = 0

    do {
      const result = await this.cache.list<FailedJobMetadata>({ prefix: FAILED_PREFIX, cursor })
      const expired = result.keys.filter((key) => {
        const failedAt = key.metadata?.failedAt
        return failedAt !== undefined && Date.parse(failedAt) < cutoff
      })
      await Promise.all(expired.map((key) => this.cache.delete(key.name)))
      removed += expired.length
      cursor = result.list_complete ? undefined : result.cursor
    } while (cursor)

    return removed
  }
}
