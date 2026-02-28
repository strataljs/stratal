import { CronJob } from 'stratal/cron';
import { Transient } from 'stratal/di';

@Transient()
export class CleanupJob implements CronJob {
  readonly schedule = '0 2 * * *'

  async execute() {
    console.log('[CleanupJob] Running daily cleanup at 2:00 AM UTC')
    // Perform cleanup tasks here (e.g., purge expired cache entries, old logs)

    return Promise.resolve();
  }

  async onError(error: Error) {
    console.error('[CleanupJob] Failed:', error.message)

    return Promise.resolve();
  }
}
