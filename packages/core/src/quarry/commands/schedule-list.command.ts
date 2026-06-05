import { inject } from '../../di'
import { DI_TOKENS } from '../../di/tokens'
import type { CronManager } from '../../cron/cron-manager'
import type { LazyModuleLoader } from '../../module/lazy-module-loader'
import { Command } from '../command'

export class ScheduleListCommand extends Command {
  static command = 'schedule:list'
  static description = 'List all registered cron jobs'

  constructor(@inject(DI_TOKENS.LazyModuleLoader) private loader: LazyModuleLoader) {
    super()
  }

  async handle(): Promise<number | void> {
    // Lazy-load the cron subsystem. For apps with jobs the manager singleton is
    // already populated (bootstrap ensureCron); for apps without jobs this is a
    // fresh empty manager → "No cron jobs found" instead of a resolve error.
    const ref = await this.loader.load(() => import('../../cron/cron.module').then(m => m.CronModule))
    const cron = ref.get<CronManager>(DI_TOKENS.Cron)

    const schedules = cron.getAllSchedules()

    if (schedules.length === 0) {
      this.info('No cron jobs found')
      return 0
    }

    const rows: string[][] = []

    for (const schedule of schedules) {
      const jobs = cron.getJobsForSchedule(schedule)
      for (const { jobClass } of jobs) {
        rows.push([schedule, jobClass.name])
      }
    }

    this.table(['Schedule', 'Job'], rows)
  }
}
