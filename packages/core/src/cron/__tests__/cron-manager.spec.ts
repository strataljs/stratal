import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CronJob } from '../cron-job'
import { CronManager } from '../cron-manager'
import { CronExecutionError } from '../errors/cron-execution.error'

describe('CronManager', () => {
  let manager: CronManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new CronManager()
  })

  const createJob = (schedule: string, name?: string): DeepMocked<CronJob> => {
    const job = createMock<CronJob>({ schedule })
    job.execute.mockResolvedValue(undefined)

    // Give the job a class name for error reporting
    if (name) {
      Object.defineProperty(job.constructor, 'name', { value: name })
    }

    return job
  }

  const createController = (cron: string): DeepMocked<ScheduledController> => {
    return { cron, scheduledTime: Date.now(), noRetry: vi.fn() } as unknown as DeepMocked<ScheduledController>
  }

  describe('registerJob()', () => {
    it('should add job to internal map', () => {
      const job = createJob('0 2 * * *')
      manager.registerJob(job)

      expect(manager.getJobsForSchedule('0 2 * * *')).toHaveLength(1)
      expect(manager.getJobsForSchedule('0 2 * * *')[0]).toBe(job)
    })

    it('should group multiple jobs under same schedule', () => {
      const job1 = createJob('0 2 * * *')
      const job2 = createJob('0 2 * * *')
      manager.registerJob(job1)
      manager.registerJob(job2)

      expect(manager.getJobsForSchedule('0 2 * * *')).toHaveLength(2)
    })
  })

  describe('getJobsForSchedule()', () => {
    it('should return registered jobs for schedule', () => {
      const job = createJob('*/15 * * * *')
      manager.registerJob(job)

      const jobs = manager.getJobsForSchedule('*/15 * * * *')
      expect(jobs).toHaveLength(1)
      expect(jobs[0]).toBe(job)
    })

    it('should return empty array for nonexistent schedule', () => {
      expect(manager.getJobsForSchedule('nonexistent')).toEqual([])
    })
  })

  describe('getAllSchedules()', () => {
    it('should return all registered cron expressions', () => {
      manager.registerJob(createJob('0 2 * * *'))
      manager.registerJob(createJob('*/15 * * * *'))

      const schedules = manager.getAllSchedules()
      expect(schedules).toContain('0 2 * * *')
      expect(schedules).toContain('*/15 * * * *')
      expect(schedules).toHaveLength(2)
    })
  })

  describe('getTotalJobCount()', () => {
    it('should return correct total across schedules', () => {
      manager.registerJob(createJob('0 2 * * *'))
      manager.registerJob(createJob('0 2 * * *'))
      manager.registerJob(createJob('*/15 * * * *'))

      expect(manager.getTotalJobCount()).toBe(3)
    })

    it('should return 0 when no jobs registered', () => {
      expect(manager.getTotalJobCount()).toBe(0)
    })
  })

  describe('executeScheduled()', () => {
    it('should call execute() on matching jobs', async () => {
      const job = createJob('0 2 * * *')
      manager.registerJob(job)

      const controller = createController('0 2 * * *')
      await manager.executeScheduled(controller)

      expect(job.execute).toHaveBeenCalledWith(controller)
    })

    it('should return without error when no matching jobs', async () => {
      const controller = createController('0 3 * * *')

      await expect(manager.executeScheduled(controller)).resolves.toBeUndefined()
    })

    it('should call onError() when job throws and continue to next job', async () => {
      const error = new Error('job failed')
      const job1 = createJob('0 2 * * *', 'FailingJob')
      job1.execute.mockRejectedValue(error)
      job1.onError!.mockResolvedValue(undefined)

      const job2 = createJob('0 2 * * *')

      manager.registerJob(job1)
      manager.registerJob(job2)

      const controller = createController('0 2 * * *')

      await expect(manager.executeScheduled(controller)).rejects.toThrow(CronExecutionError)

      expect(job1.onError).toHaveBeenCalledWith(error, controller)
      expect(job2.execute).toHaveBeenCalledWith(controller)
    })

    it('should throw CronExecutionError with aggregated error info when jobs fail', async () => {
      const job = createJob('0 2 * * *', 'CleanupJob')
      job.execute.mockRejectedValue(new Error('cleanup failed'))
      job.onError!.mockResolvedValue(undefined)

      manager.registerJob(job)

      const controller = createController('0 2 * * *')

      try {
        await manager.executeScheduled(controller)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(CronExecutionError)
      }
    })

    it('should execute multiple jobs on same schedule sequentially', async () => {
      const executionOrder: number[] = []

      const job1 = createJob('0 2 * * *')
      job1.execute.mockImplementation(() => { executionOrder.push(1); return Promise.resolve() })

      const job2 = createJob('0 2 * * *')
      job2.execute.mockImplementation(() => { executionOrder.push(2); return Promise.resolve() })

      manager.registerJob(job1)
      manager.registerJob(job2)

      await manager.executeScheduled(createController('0 2 * * *'))

      expect(executionOrder).toEqual([1, 2])
    })

    it('should handle onError() itself failing gracefully', async () => {
      const job = createJob('0 2 * * *')
      job.execute.mockRejectedValue(new Error('job failed'))
      job.onError!.mockRejectedValue(new Error('onError also failed'))

      manager.registerJob(job)

      const controller = createController('0 2 * * *')

      // Should still throw CronExecutionError, not the onError error
      await expect(manager.executeScheduled(controller)).rejects.toThrow(CronExecutionError)
    })
  })
})
