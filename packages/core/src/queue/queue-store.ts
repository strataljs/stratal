import { inject } from '../di'
import { Transient } from '../di/decorators'
import { type StratalEnv } from '../env'
import { DI_TOKENS } from '../di/tokens'
import type { FailedJob, FailedJobMetadata } from './failed-job'
import { QueueError } from './queue.error'
import type { QueueModuleOptions } from './queue.module'
import { QUEUE_TOKENS } from './queue.tokens'

const IDEM_PREFIX = 'queue:idem:'
const FAILED_PREFIX = 'queue:failed:'
const DEFAULT_IDEMPOTENCY_TTL = 86400

@Transient(QUEUE_TOKENS.QueueStore)
export class QueueStore {
  private readonly kv: KVNamespace

  constructor(
    @inject(DI_TOKENS.CloudflareEnv) env: StratalEnv,
    @inject(QUEUE_TOKENS.QueueModuleOptions) options: QueueModuleOptions,
  ) {
    const binding = options.store.binding
    const kv = (env as unknown as Record<string, unknown>)[binding] as KVNamespace | undefined

    if (!kv) {
      throw new QueueError(`KV binding "${binding}" was not found in the environment`)
    }

    this.kv = kv
    this.idempotencyTtl = options.idempotency?.ttl ?? DEFAULT_IDEMPOTENCY_TTL
  }

  private readonly idempotencyTtl: number

  async isProcessed(key: string): Promise<boolean> {
    return (await this.kv.get(`${IDEM_PREFIX}${key}`)) !== null
  }

  async markProcessed(key: string): Promise<void> {
    await this.kv.put(`${IDEM_PREFIX}${key}`, '1', {
      expirationTtl: this.idempotencyTtl,
    })
  }

  async storeFailedJob(job: FailedJob): Promise<void> {
    const metadata: FailedJobMetadata = {
      queue: job.queue,
      type: job.type,
      consumer: job.consumer,
      attempts: job.attempts,
      failedAt: job.failedAt,
    }

    await this.kv.put(`${FAILED_PREFIX}${job.id}`, JSON.stringify(job), {
      metadata,
    })
  }

  async getFailedJob(messageId: string): Promise<FailedJob | null> {
    return this.kv.get<FailedJob>(`${FAILED_PREFIX}${messageId}`, 'json')
  }

  async removeFailedJob(messageId: string): Promise<void> {
    await this.kv.delete(`${FAILED_PREFIX}${messageId}`)
  }

  async listFailedJobs(options?: {
    limit?: number
    cursor?: string
  }): Promise<{ keys: { id: string; metadata: FailedJobMetadata }[]; cursor?: string }> {
    const result = await this.kv.list<FailedJobMetadata>({
      prefix: FAILED_PREFIX,
      limit: options?.limit ?? 50,
      cursor: options?.cursor,
    })

    const keys = result.keys.map((key) => ({
      id: key.name.slice(FAILED_PREFIX.length),
      metadata: key.metadata!,
    }))

    return {
      keys,
      cursor: result.list_complete ? undefined : result.cursor,
    }
  }

  async purgeFailedJobs(): Promise<void> {
    let cursor: string | undefined

    do {
      const result = await this.kv.list({ prefix: FAILED_PREFIX, cursor })
      await Promise.all(result.keys.map((key) => this.kv.delete(key.name)))
      cursor = result.list_complete ? undefined : result.cursor
    } while (cursor)
  }
}
