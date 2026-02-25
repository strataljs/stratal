import { ApplicationError } from '../../infrastructure/error-handler'
import { ERROR_CODES } from '../../errors'

/**
 * Error thrown when one or more cron jobs fail execution
 *
 * This error aggregates failures from multiple jobs that share the same schedule.
 */
export class CronExecutionError extends ApplicationError {
	constructor(
		schedule: string,
		failedJobsCount: number,
		jobNames: string
	) {
		super(
			'errors.cronExecutionFailed',
			ERROR_CODES.SYSTEM.CRON_EXECUTION_FAILED,
			{
				schedule,
				count: failedJobsCount,
				jobs: jobNames
			}
		)
	}
}
