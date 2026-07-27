import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Container } from '../../di/container'
import { LOGGER_TOKENS } from '../../logger/logger.tokens'
import type { LoggerService } from '../../logger/services/logger.service'
import type { CronJob } from '../cron-job'
import { CronManager } from '../cron-manager'
import { CronExecutionError } from '../errors/cron-execution.error'

describe('CronManager', () => {
  let manager: CronManager
  let mockContainer: DeepMocked<Container>

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new CronManager()
    mockContainer = createMock<Container>()
  })

  /**
   * Helper to create a mock CronJob class.
   * Returns both the class and a mock instance that the container will resolve to.
   */
  const createJobClass = (schedule: string, name?: string) => {
    const mockInstance = createMock<CronJob>()
    mockInstance.execute.mockResolvedValue(undefined)

    class MockJob implements CronJob {
      static schedule = schedule
      execute = mockInstance.execute
      onError = mockInstance.onError
    }

    if (name) {
      Object.defineProperty(MockJob, 'name', { value: name })
    }

    return { JobClass: MockJob, mockInstance }
  }

  const createController = (cron: string): DeepMocked<ScheduledController> => {
    return { cron, scheduledTime: Date.now(), noRetry: vi.fn() }
  }

  describe('registerJob()', () => {
    it('should add job to internal map', () => {
      const { JobClass } = createJobClass('0 2 * * *')
      manager.registerJob('0 2 * * *', JobClass)

      expect(manager.getJobsForSchedule('0 2 * * *')).toHaveLength(1)
      expect(manager.getJobsForSchedule('0 2 * * *')[0].jobClass).toBe(JobClass)
    })

    it('should group multiple jobs under same schedule', () => {
      const { JobClass: Job1 } = createJobClass('0 2 * * *')
      const { JobClass: Job2 } = createJobClass('0 2 * * *')
      manager.registerJob('0 2 * * *', Job1)
      manager.registerJob('0 2 * * *', Job2)

      expect(manager.getJobsForSchedule('0 2 * * *')).toHaveLength(2)
    })
  })

  describe('getJobsForSchedule()', () => {
    it('should return registered jobs for schedule', () => {
      const { JobClass } = createJobClass('*/15 * * * *')
      manager.registerJob('*/15 * * * *', JobClass)

      const jobs = manager.getJobsForSchedule('*/15 * * * *')
      expect(jobs).toHaveLength(1)
      expect(jobs[0].jobClass).toBe(JobClass)
    })

    it('should return empty array for nonexistent schedule', () => {
      expect(manager.getJobsForSchedule('nonexistent')).toEqual([])
    })
  })

  describe('getAllSchedules()', () => {
    it('should return all registered cron expressions', () => {
      const { JobClass: Job1 } = createJobClass('0 2 * * *')
      const { JobClass: Job2 } = createJobClass('*/15 * * * *')
      manager.registerJob('0 2 * * *', Job1)
      manager.registerJob('*/15 * * * *', Job2)

      const schedules = manager.getAllSchedules()
      expect(schedules).toContain('0 2 * * *')
      expect(schedules).toContain('*/15 * * * *')
      expect(schedules).toHaveLength(2)
    })
  })

  describe('getTotalJobCount()', () => {
    it('should return correct total across schedules', () => {
      const { JobClass: Job1 } = createJobClass('0 2 * * *')
      const { JobClass: Job2 } = createJobClass('0 2 * * *')
      const { JobClass: Job3 } = createJobClass('*/15 * * * *')
      manager.registerJob('0 2 * * *', Job1)
      manager.registerJob('0 2 * * *', Job2)
      manager.registerJob('*/15 * * * *', Job3)

      expect(manager.getTotalJobCount()).toBe(3)
    })

    it('should return 0 when no jobs registered', () => {
      expect(manager.getTotalJobCount()).toBe(0)
    })
  })

  describe('executeScheduled()', () => {
    it('should resolve and execute matching jobs from container', async () => {
      const { JobClass, mockInstance } = createJobClass('0 2 * * *')
      manager.registerJob('0 2 * * *', JobClass)

      mockContainer.resolve.mockReturnValue(mockInstance)

      const controller = createController('0 2 * * *')
      await manager.executeScheduled(controller, mockContainer)

      expect(mockContainer.resolve).toHaveBeenCalledWith(JobClass)
      expect(mockInstance.execute).toHaveBeenCalledWith(controller)
    })

    it('should return without error when no matching jobs', async () => {
      const controller = createController('0 3 * * *')

      await expect(manager.executeScheduled(controller, mockContainer)).resolves.toBeUndefined()
    })

    it('should warn via the logger when no jobs match the trigger', async () => {
      const { JobClass } = createJobClass('*/2 * * * *')
      manager.registerJob('*/2 * * * *', JobClass)

      const mockLogger = createMock<LoggerService>()
      mockContainer.resolve.mockImplementation((token: any) => {
        if (token === LOGGER_TOKENS.LoggerService) return mockLogger
        throw new Error(`Unexpected token: ${String(token)}`)
      })

      await manager.executeScheduled(createController('*/9 * * * *'), mockContainer)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No cron jobs matched scheduled trigger',
        expect.objectContaining({
          incomingCron: '*/9 * * * *',
          registeredSchedules: ['*/2 * * * *'],
        }),
      )
    })

    it('should call onError() when job throws and continue to next job', async () => {
      const error = new Error('job failed')
      const { JobClass: Job1, mockInstance: instance1 } = createJobClass('0 2 * * *', 'FailingJob')
      instance1.execute.mockRejectedValue(error)
      instance1.onError!.mockResolvedValue(undefined)

      const { JobClass: Job2, mockInstance: instance2 } = createJobClass('0 2 * * *')

      manager.registerJob('0 2 * * *', Job1)
      manager.registerJob('0 2 * * *', Job2)

      // Container resolves the appropriate mock for each class
      mockContainer.resolve.mockImplementation((token: any) => {
        if (token === Job1) return instance1
        if (token === Job2) return instance2
        throw new Error(`Unexpected token: ${token}`)
      })

      const controller = createController('0 2 * * *')

      await expect(manager.executeScheduled(controller, mockContainer)).rejects.toThrow(CronExecutionError)

      expect(instance1.onError).toHaveBeenCalledWith(error, controller)
      expect(instance2.execute).toHaveBeenCalledWith(controller)
    })

    it('should throw CronExecutionError with aggregated error info when jobs fail', async () => {
      const { JobClass, mockInstance } = createJobClass('0 2 * * *', 'CleanupJob')
      mockInstance.execute.mockRejectedValue(new Error('cleanup failed'))
      mockInstance.onError!.mockResolvedValue(undefined)

      manager.registerJob('0 2 * * *', JobClass)
      mockContainer.resolve.mockReturnValue(mockInstance)

      const controller = createController('0 2 * * *')

      try {
        await manager.executeScheduled(controller, mockContainer)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(CronExecutionError)
      }
    })

    it('should execute multiple jobs on same schedule sequentially', async () => {
      const executionOrder: number[] = []

      const { JobClass: Job1, mockInstance: instance1 } = createJobClass('0 2 * * *')
      instance1.execute.mockImplementation(() => { executionOrder.push(1); return Promise.resolve() })

      const { JobClass: Job2, mockInstance: instance2 } = createJobClass('0 2 * * *')
      instance2.execute.mockImplementation(() => { executionOrder.push(2); return Promise.resolve() })

      manager.registerJob('0 2 * * *', Job1)
      manager.registerJob('0 2 * * *', Job2)

      mockContainer.resolve.mockImplementation((token: any) => {
        if (token === Job1) return instance1
        if (token === Job2) return instance2
        throw new Error(`Unexpected token: ${token}`)
      })

      await manager.executeScheduled(createController('0 2 * * *'), mockContainer)

      expect(executionOrder).toEqual([1, 2])
    })

    it('should handle onError() itself failing gracefully', async () => {
      const { JobClass, mockInstance } = createJobClass('0 2 * * *')
      mockInstance.execute.mockRejectedValue(new Error('job failed'))
      mockInstance.onError!.mockRejectedValue(new Error('onError also failed'))

      manager.registerJob('0 2 * * *', JobClass)
      mockContainer.resolve.mockReturnValue(mockInstance)

      const controller = createController('0 2 * * *')

      // Should still throw CronExecutionError, not the onError error
      await expect(manager.executeScheduled(controller, mockContainer)).rejects.toThrow(CronExecutionError)
    })
  })
})
