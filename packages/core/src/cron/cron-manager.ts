import type { Container } from '../di/container'
import { Transient } from '../di/decorators'
import type { CronJob, RegisteredJob } from './cron-job'
import { CronExecutionError } from './errors/cron-execution.error'

/**
 * Manages cron job registration and execution
 *
 * CronManager is a singleton service that:
 * - Registers cron job class references from modules
 * - Routes scheduled events to matching jobs
 * - Resolves jobs from a request-scoped container at execution time
 *
 * Jobs are grouped by their cron expression, allowing multiple jobs
 * to run on the same schedule.
 */
@Transient()
export class CronManager {
	/**
	 * Map of cron expressions to registered job entries
	 * Key: Cron expression (e.g., '0 2 * * *')
	 * Value: Array of registered jobs (class ref + schedule)
	 */
	private jobs = new Map<string, RegisteredJob[]>()

	/**
	 * Register a cron job class
	 *
	 * Jobs with the same schedule are grouped together and executed
	 * sequentially when the trigger fires.
	 *
	 * @param schedule - Cron expression (e.g., '0 2 * * *')
	 * @param jobClass - CronJob class constructor (resolved at execution time)
	 */
	registerJob(schedule: string, jobClass: RegisteredJob['jobClass']): void {
		const existing = this.jobs.get(schedule) ?? []
		existing.push({ schedule, jobClass })
		this.jobs.set(schedule, existing)
	}

	/**
	 * Execute all jobs matching the triggered cron expression
	 *
	 * Jobs are resolved from the provided request-scoped container,
	 * ensuring dependencies (e.g. database) are properly scoped.
	 *
	 * Jobs are executed sequentially. If a job fails:
	 * - Its onError() hook is called (if defined)
	 * - Execution continues with the next job
	 * - Errors are collected and thrown as CronExecutionError
	 *
	 * @param controller - Cloudflare ScheduledController
	 * @param container - Request-scoped container to resolve jobs from
	 */
	async executeScheduled(controller: ScheduledController, container: Container): Promise<void> {
		const { cron } = controller
		const matchingJobs = this.jobs.get(cron) ?? []

		if (matchingJobs.length === 0) {
			return
		}

		const errors: { job: string; error: Error }[] = []

		for (const { jobClass } of matchingJobs) {
			const jobName = jobClass.name

			try {
				// Register the job class in the request-scoped container so its
				// dependencies are resolved from request scope (not the parent).
				// Without this, tsyringe falls through to the parent container
				// and request-scoped services (e.g. database) get stale instances.
				container.register(jobClass, jobClass)
				const job = container.resolve<CronJob>(jobClass)
				await job.execute(controller)
			} catch (error) {
				const err = error as Error
				errors.push({ job: jobName, error: err })

				// Try to resolve and call onError if possible
				try {
					const job = container.resolve<CronJob>(jobClass)
					if (job.onError) {
						await job.onError(err, controller)
					}
				} catch {
					// If resolution or onError fails, continue
				}
			}
		}

		// If any jobs failed, throw an aggregate error
		// This ensures the error is logged by ExceptionHandler
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
	 * @returns Array of registered jobs, or empty array if none
	 */
	getJobsForSchedule(schedule: string): RegisteredJob[] {
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
