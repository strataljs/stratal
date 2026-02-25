import { Transient } from '../di/decorators'
import type { CronJob } from './cron-job'
import { CronExecutionError } from './errors/cron-execution.error'

/**
 * Manages cron job registration and execution
 *
 * CronManager is a singleton service that:
 * - Registers cron jobs from modules
 * - Routes scheduled events to matching jobs
 * - Handles errors during job execution
 *
 * Jobs are grouped by their cron expression, allowing multiple jobs
 * to run on the same schedule.
 */
@Transient()
export class CronManager {
	/**
	 * Map of cron expressions to jobs
	 * Key: Cron expression (e.g., '0 2 * * *')
	 * Value: Array of jobs matching that expression
	 */
	private jobs = new Map<string, CronJob[]>()

	/**
	 * Register a cron job
	 *
	 * Jobs with the same schedule are grouped together and executed
	 * sequentially when the trigger fires.
	 *
	 * @param job - CronJob instance to register
	 */
	registerJob(job: CronJob): void {
		const existing = this.jobs.get(job.schedule) ?? []
		existing.push(job)
		this.jobs.set(job.schedule, existing)
	}

	/**
	 * Execute all jobs matching the triggered cron expression
	 *
	 * Jobs are executed sequentially. If a job fails:
	 * - Its onError() hook is called (if defined)
	 * - Execution continues with the next job
	 * - Errors are collected and logged
	 *
	 * @param controller - Cloudflare ScheduledController
	 */
	async executeScheduled(controller: ScheduledController): Promise<void> {
		const { cron } = controller
		const matchingJobs = this.jobs.get(cron) ?? []

		if (matchingJobs.length === 0) {
			return
		}

		const errors: { job: string; error: Error }[] = []

		for (const job of matchingJobs) {
			const jobName = job.constructor.name

			try {
				await job.execute(controller)
			} catch (error) {
				const err = error as Error
				errors.push({ job: jobName, error: err })

				// Call job's error handler if defined
				if (job.onError) {
					try {
						await job.onError(err, controller)
					} catch {
						// If onError() itself fails, we just continue
						// The error will be logged by GlobalErrorHandler
					}
				}
			}
		}

		// If any jobs failed, throw an aggregate error
		// This ensures the error is logged by GlobalErrorHandler
		if (errors.length > 0) {
			const jobNames = errors
				.map(({ job, error }) => `${job}: ${error.message}`)
				.join('; ')

			throw new CronExecutionError(cron, errors.length, jobNames)
		}
	}

	/**
	 * Get all registered jobs for a specific cron expression
	 *
	 * @param schedule - Cron expression
	 * @returns Array of jobs for that schedule, or empty array if none
	 */
	getJobsForSchedule(schedule: string): CronJob[] {
		return this.jobs.get(schedule) ?? []
	}

	/**
	 * Get all registered cron expressions
	 *
	 * @returns Array of unique cron expressions
	 */
	getAllSchedules(): string[] {
		return Array.from(this.jobs.keys())
	}

	/**
	 * Get total number of registered jobs across all schedules
	 *
	 * @returns Total job count
	 */
	getTotalJobCount(): number {
		let count = 0
		for (const jobs of this.jobs.values()) {
			count += jobs.length
		}
		return count
	}
}
