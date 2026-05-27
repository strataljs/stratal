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

    const { keys, cursor } = await this.store.listFailedJobs({ limit })

    const filtered = queueFilter
      ? keys.filter((k) => k.metadata.queue === queueFilter)
      : keys

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

    if (cursor) {
      this.comment(`Showing first ${limit} results. More jobs available.`)
    }

    return undefined
  }
}
