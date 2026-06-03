import { inject } from '../../di'
import type { QueueStore } from '../../queue/queue-store'
import { QUEUE_TOKENS } from '../../queue/queue.tokens'
import { Command } from '../command'

export class QueuePurgeCommand extends Command {
  static command = 'queue:purge {id? : Message ID to purge} {--all : Purge all failed jobs} {--queue= : Filter by queue name}'
  static description = 'Delete failed queue jobs without retrying'

  constructor(@inject(QUEUE_TOKENS.QueueStore) private store: QueueStore) {
    super()
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
      await this.store.removeFailedJob(id)
      this.success(`Purged job ${id}`)
      return undefined
    }

    if (queueFilter) {
      // Collect all matching keys first, then delete: removing keys mid-listing
      // shifts the cursor and would skip jobs in a single pass.
      const ids: string[] = []
      let cursor: string | undefined

      do {
        const result = await this.store.listFailedJobs({ cursor, limit: 100 })
        cursor = result.cursor
        for (const key of result.keys) {
          if (key.metadata.queue !== queueFilter) continue
          ids.push(key.id)
        }
      } while (cursor)

      for (const id of ids) {
        await this.store.removeFailedJob(id)
      }

      this.success(`Purged ${ids.length} job(s) from queue "${queueFilter}"`)
    } else {
      await this.store.purgeFailedJobs()
      this.success('Purged all failed jobs')
    }

    return undefined
  }
}
