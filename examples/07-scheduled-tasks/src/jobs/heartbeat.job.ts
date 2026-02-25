import { CronJob, Transient } from 'stratal';

@Transient()
export class HeartbeatJob implements CronJob {
  readonly schedule = '*/5 * * * *'

  async execute() {
    console.log(`[HeartbeatJob] Heartbeat at ${new Date().toISOString()}`)

    return Promise.resolve();
  }
}
