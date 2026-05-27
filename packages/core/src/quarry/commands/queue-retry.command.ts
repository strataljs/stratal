import { inject } from '../../di'
import type { IQueueProvider } from '../../queue/providers'
import type { QueueStore } from '../../queue/queue-store'
import { QUEUE_TOKENS } from '../../queue/queue.tokens'
import type { QueueProviderFactory } from '../../queue/services'
import { Command } from '../command'

export class QueueRetryCommand extends Command {
  static command = 'queue:retry {id? : Message ID to retry} {--all : Retry all failed jobs} {--queue= : Filter by queue name}'
  static description = 'Retry failed queue jobs'

  private provider: IQueueProvider

  constructor(
    @inject(QUEUE_TOKENS.QueueStore) private store: QueueStore,
    @inject(QUEUE_TOKENS.QueueProviderFactory) factory: QueueProviderFactory,
  ) {
    super()
    this.provider = factory.create()
  }

  async handle(): Promise<number | undefined> {
    const id = this.string('id')
    const all = this.boolean('all')
    const queueFilter = this.string('queue')

    if (!id && !all) {
      this.fail('Provide a message ID or use --all')
      return 1
    }

    if (id) {
      return this.retryOne(id)
    }

    return this.retryAll(queueFilter)
  }

  private async retryOne(id: string): Promise<number | undefined> {
    const job = await this.store.getFailedJob(id)

    if (!job) {
      this.fail(`Failed job "${id}" not found`)
      return 1
    }

    await this.provider.send(job.queue, {
      ...job.message,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    })
    await this.store.removeFailedJob(id)
    this.success(`Retried job ${id}`)

    return undefined
  }

  private async retryAll(queueFilter?: string): Promise<number | undefined> {
    let cursor: string | undefined
    let count = 0

    do {
      const result = await this.store.listFailedJobs({ cursor, limit: 100 })
      cursor = result.cursor

      for (const key of result.keys) {
        if (queueFilter && key.metadata.queue !== queueFilter) continue

        const job = await this.store.getFailedJob(key.id)
        if (!job) continue

        await this.provider.send(job.queue, {
          ...job.message,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        })
        await this.store.removeFailedJob(key.id)
        count++
      }
    } while (cursor)

    this.success(`Retried ${count} job(s)`)
    return undefined
  }
}
