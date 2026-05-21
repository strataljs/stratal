import { describe, expect, it } from 'vitest'
import { CronExecutionError } from '../errors/cron-execution.error'

describe('CronExecutionError', () => {
	it('exposes the single failure directly as cause when only one job fails', () => {
		const inner = new Error('db down')
		const error = new CronExecutionError('0 0 * * *', [{ job: 'StepTimeoutJob', error: inner }])

		expect(error.cause).toBe(inner)
		expect(error.failures).toHaveLength(1)
		expect(error.metadata).toMatchObject({
			schedule: '0 0 * * *',
			count: 1,
			jobs: [{ job: 'StepTimeoutJob', name: 'Error', message: 'db down' }],
		})
	})

	it('wraps multiple failures in an AggregateError as cause', () => {
		const a = new Error('a failed')
		const b = new Error('b failed')
		const error = new CronExecutionError('0 0 * * *', [
			{ job: 'A', error: a },
			{ job: 'B', error: b },
		])

		expect(error.cause).toBeInstanceOf(AggregateError)
		const aggregate = error.cause as AggregateError
		expect(aggregate.errors).toEqual([a, b])
		expect(error.failures).toEqual([
			{ job: 'A', error: a },
			{ job: 'B', error: b },
		])
	})

	it('forwards ApplicationError code and DB metadata into the jobs metadata', () => {
		const dbError = Object.assign(new Error('relation "x" does not exist'), {
			code: 2000,
			metadata: { dbErrorCode: '42P01', sql: 'SELECT * FROM x' },
		})
		const error = new CronExecutionError('0 0 * * *', [{ job: 'StepTimeoutJob', error: dbError }])

		expect(error.metadata?.jobs).toEqual([
			{
				job: 'StepTimeoutJob',
				name: 'Error',
				message: 'relation "x" does not exist',
				code: 2000,
				dbErrorCode: '42P01',
				sql: 'SELECT * FROM x',
			},
		])
	})
})
