import { inject } from 'tsyringe'
import { DI_TOKENS } from '../../di/tokens'
import type { CronManager } from '../../cron/cron-manager'
import { Command } from '../command'

export class ScheduleListCommand extends Command {
  static command = 'schedule:list'
  static description = 'List all registered cron jobs'

  constructor(@inject(DI_TOKENS.Cron) private cron: CronManager) {
    super()
  }

  handle(): number | undefined {
    const schedules = this.cron.getAllSchedules()

    if (schedules.length === 0) {
      this.info('No cron jobs found')
      return 0
    }

    const rows: string[][] = []

    for (const schedule of schedules) {
      const jobs = this.cron.getJobsForSchedule(schedule)
      for (const { jobClass } of jobs) {
        rows.push([schedule, jobClass.name])
      }
    }

    this.table(['Schedule', 'Job'], rows)

    return undefined
  }
}
