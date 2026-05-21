import { ApplicationError } from '../../errors'
import { ERROR_CODES } from '../../errors'

export interface CronJobFailure {
	job: string
	error: Error
}

interface SerializedJobFailure {
	job: string
	name: string
	code?: number | string
	message: string
	dbErrorCode?: string
	sql?: string
}

/**
 * Error thrown when one or more cron jobs fail execution.
 *
 * Aggregates failures from multiple jobs that share the same schedule while
 * preserving each underlying error:
 * - The originals are kept on `this.failures` for typed access.
 * - `this.cause` is set to the only failure (1 job) or an `AggregateError`
 *   wrapping all of them (2+ jobs), so `LoggerService.serializeError` can
 *   walk the chain and surface every stack/cause.
 * - `metadata.jobs` is a structured array (not a flat string), so the JSON
 *   formatter emits one entry per failure with name/code/message/dbErrorCode/sql.
 */
export class CronExecutionError extends ApplicationError {
	public readonly failures: readonly CronJobFailure[]

	constructor(schedule: string, failures: CronJobFailure[]) {
		const jobsMetadata = failures.map((f) => serializeFailure(f))
		const cause =
			failures.length === 0
				? undefined
				: failures.length === 1
					? failures[0].error
					: new AggregateError(failures.map((f) => f.error), `${failures.length} cron jobs failed`)

		super(
			'errors.cronExecutionFailed',
			ERROR_CODES.SYSTEM.CRON_EXECUTION_FAILED,
			{
				schedule,
				count: failures.length,
				jobs: jobsMetadata,
			},
			cause,
		)

		this.failures = failures
	}
}

function serializeFailure({ job, error }: CronJobFailure): SerializedJobFailure {
	const out: SerializedJobFailure = {
		job,
		name: error.name,
		message: error.message,
	}
	const maybeCoded = error as { code?: number | string; metadata?: Record<string, unknown> }
	if (maybeCoded.code !== undefined) out.code = maybeCoded.code
	if (maybeCoded.metadata) {
		const meta = maybeCoded.metadata
		if (typeof meta.dbErrorCode === 'string') out.dbErrorCode = meta.dbErrorCode
		if (typeof meta.sql === 'string') out.sql = meta.sql
	}
	return out
}
