import { describe, expect, it } from 'vitest'
import { CronExecutionError } from '../errors/cron-execution.error'

describe('CronExecutionError', () => {
	it('exposes the single failure directly as cause when only one job fails', () => {
		const inner = new Error('db down')
		const error = new CronExecutionError('0 0 * * *', [{ job: 'StepTimeoutJob', error: inner }])

		expect(error.cause).toBe(inner)
		expect(error.failures).toHaveLength(1)
		expect(error.schedule).toBe('0 0 * * *')
		expect(error.failureCount).toBe(1)
		expect(error.jobs).toEqual([{ job: 'StepTimeoutJob', name: 'Error', message: 'db down' }])
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

	it('forwards error code into the serialized jobs', () => {
		const dbError = Object.assign(new Error('relation "x" does not exist'), {
			code: 2000,
		})
		const error = new CronExecutionError('0 0 * * *', [{ job: 'StepTimeoutJob', error: dbError }])

		expect(error.jobs).toEqual([
			{
				job: 'StepTimeoutJob',
				name: 'Error',
				message: 'relation "x" does not exist',
				code: 2000,
			},
		])
	})
})
