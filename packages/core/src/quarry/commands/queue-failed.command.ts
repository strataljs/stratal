import { inject } from '../../di'
import type { QueueStore } from '../../queue/queue-store'
import { QUEUE_TOKENS } from '../../queue/queue.tokens'
import { Command } from '../command'

export class QueueFailedCommand extends Command {
  static command = 'queue:failed {--queue= : Filter by queue name} {--limit= : Max results (default 50)}'
  static description = 'List failed queue jobs'

  constructor(@inject(QUEUE_TOKENS.QueueStore) private store: QueueStore) {
    super()
  }

  async handle(): Promise<number | undefined> {
    const queueFilter = this.string('queue')
    const limit = this.number('limit') || 50

    // Without a filter, one page of `limit` keys is the result. With a filter,
    // keep paginating until we've collected `limit` MATCHING jobs (or run out),
    // so `--limit` counts matching jobs rather than scanned keys.
    const filtered: { id: string; metadata: { queue: string; type: string; consumer: string; attempts: number; failedAt: string } }[] = []
    let cursor: string | undefined
    let more = false

    do {
      const result = await this.store.listFailedJobs({ cursor, limit })
      cursor = result.cursor
      for (const key of result.keys) {
        if (queueFilter && key.metadata.queue !== queueFilter) continue
        if (filtered.length >= limit) {
          more = true
          break
        }
        filtered.push(key)
      }
    } while (cursor && filtered.length < limit)

    if (cursor) more = true

    if (filtered.length === 0) {
      this.info('No failed jobs found')
      return 0
    }

    this.table(
      ['ID', 'Queue', 'Type', 'Consumer', 'Attempts', 'Failed At'],
      filtered.map((k) => [
        k.id,
        k.metadata.queue,
        k.metadata.type,
        k.metadata.consumer,
        String(k.metadata.attempts),
        k.metadata.failedAt,
      ]),
    )

    if (more) {
      this.comment(`Showing first ${limit} results. More jobs available.`)
    }

    return undefined
  }
}
