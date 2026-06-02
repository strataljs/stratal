import type { CronJob } from '../../cron/cron-job'
import { inject } from '../../di'
import { Transient } from '../../di/decorators'
import { LOGGER_TOKENS, type LoggerService } from '../../logger'
import type { Constructor } from '../../types'
import type { QueueModuleOptions } from '../queue.module'
import type { QueueStore } from '../queue-store'
import { QUEUE_TOKENS } from '../queue.tokens'

/** Retention applied when `failedJobs.retention` is not configured. */
const DEFAULT_RETENTION_SECONDS = 604800 // 7 days

/**
 * Opt-in cron job that deletes failed jobs older than `failedJobs.retention`
 * (default 7 days). Failed jobs are persisted indefinitely by default; register
 * this job only if you want automatic cleanup.
 *
 * ```ts
 * @Module({
 *   imports: [
 *     QueueModule.forRoot({ provider: 'cloudflare', failedJobs: { retention: 1209600 } }),
 *   ],
 *   jobs: [FailedJobCleanupJob], // daily at 00:00 UTC
 * })
 * export class AppModule {}
 * ```
 *
 * Add a matching cron trigger to `wrangler.jsonc` (`"0 0 * * *"` for the
 * default schedule), or use {@link failedJobCleanupJob} for a custom one.
 */
@Transient()
export class FailedJobCleanupJob implements CronJob {
  static schedule = '0 0 * * *' // daily at 00:00 UTC

  constructor(
    @inject(QUEUE_TOKENS.QueueStore) private readonly store: QueueStore,
    @inject(QUEUE_TOKENS.QueueModuleOptions) private readonly options: QueueModuleOptions,
    @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService,
  ) {}

  async execute(): Promise<void> {
    const retention = this.options.failedJobs?.retention ?? DEFAULT_RETENTION_SECONDS
    const removed = await this.store.purgeFailedJobsOlderThan(retention)
    this.logger.info('Failed-job cleanup complete', { removed, retentionSeconds: retention })
  }
}

/**
 * Create a {@link FailedJobCleanupJob} bound to a custom cron schedule (which
 * must match a `wrangler.jsonc` trigger). Use when the default daily schedule
 * isn't desired:
 *
 * ```ts
 * @Module({ jobs: [failedJobCleanupJob('0 3 * * 0')] }) // weekly, Sundays 03:00
 * ```
 */
export function failedJobCleanupJob(schedule: string): Constructor<CronJob> {
  return class extends FailedJobCleanupJob {
    static schedule = schedule
  }
}
