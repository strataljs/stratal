import { ApplicationError } from '../../errors'

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
 */
export class CronExecutionError extends ApplicationError {
	public readonly failures: readonly CronJobFailure[]
	public readonly schedule: string
	public readonly failureCount: number
	public readonly jobs: SerializedJobFailure[]

	constructor(schedule: string, failures: CronJobFailure[]) {
		const cause =
			failures.length === 0
				? undefined
				: failures.length === 1
					? failures[0].error
					: new AggregateError(failures.map((f) => f.error), `${failures.length} cron jobs failed`)

		super(
			`${failures.length} cron job(s) failed for schedule "${schedule}"`,
			cause,
		)

		this.failures = failures
		this.schedule = schedule
		this.failureCount = failures.length
		this.jobs = failures.map((f) => serializeFailure(f))
	}
}

function serializeFailure({ job, error }: CronJobFailure): SerializedJobFailure {
	const out: SerializedJobFailure = {
		job,
		name: error.name,
		message: error.message,
	}
	const maybeCoded = error as { code?: number | string }
	if (maybeCoded.code !== undefined) out.code = maybeCoded.code
	return out
}
