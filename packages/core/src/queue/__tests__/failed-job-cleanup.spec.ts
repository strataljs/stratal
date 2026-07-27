import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoggerService } from '../../logger'
import type { TieredCacheService } from '../../cache/services/tiered-cache.service'
import { FailedJobCleanupJob, failedJobCleanupJob } from '../jobs/failed-job-cleanup.job'
import type { QueueModuleOptions } from '../queue.module'
import { QueueStore } from '../queue-store'

describe('FailedJobCleanupJob', () => {
  let store: DeepMocked<QueueStore>
  let logger: DeepMocked<LoggerService>

  beforeEach(() => {
    vi.clearAllMocks()
    store = createMock<QueueStore>()
    store.purgeFailedJobsOlderThan.mockResolvedValue(3)
    logger = createMock<LoggerService>()
  })

  const options = (failedJobs?: QueueModuleOptions['failedJobs']): QueueModuleOptions =>
    ({ provider: 'cloudflare', failedJobs })

  it('purges failed jobs older than the configured retention', async () => {
    const job = new FailedJobCleanupJob(store, options({ retention: 1209600 }), logger)

    await job.execute()

    expect(store.purgeFailedJobsOlderThan).toHaveBeenCalledWith(1209600)
  })

  it('defaults to 7-day retention when not configured', async () => {
    const job = new FailedJobCleanupJob(store, options(), logger)

    await job.execute()

    expect(store.purgeFailedJobsOlderThan).toHaveBeenCalledWith(604800)
  })

  it('has a daily default schedule, overridable via the factory', () => {
    expect(FailedJobCleanupJob.schedule).toBe('0 0 * * *')

    const Weekly = failedJobCleanupJob('0 3 * * 0') as unknown as { schedule: string }
    expect(Weekly.schedule).toBe('0 3 * * 0')
  })
})

describe('QueueStore.purgeFailedJobsOlderThan', () => {
  it('deletes only failed jobs older than the cutoff', async () => {
    const now = Date.now()
    const entries = new Map<string, { metadata: { failedAt: string } }>([
      ['queue:failed:old', { metadata: { failedAt: new Date(now - 10 * 86400 * 1000).toISOString() } }],
      ['queue:failed:recent', { metadata: { failedAt: new Date(now - 1 * 86400 * 1000).toISOString() } }],
    ])

    const deleted: string[] = []
    const cache = {
      // QueueStore binds to its configured namespace via `binding()`.
      binding: vi.fn().mockReturnThis(),
      list: vi.fn().mockResolvedValue({
        keys: [...entries].map(([name, { metadata }]) => ({ name, metadata })),
        list_complete: true,
      }),
      delete: vi.fn((name: string) => {
        deleted.push(name)
        return Promise.resolve()
      }),
    }

    const store = new QueueStore(
      cache as unknown as TieredCacheService,
      { provider: 'cloudflare' },
    )

    // Retain 7 days: the 10-day-old job is removed, the 1-day-old job is kept.
    const removed = await store.purgeFailedJobsOlderThan(7 * 86400)

    expect(removed).toBe(1)
    expect(deleted).toEqual(['queue:failed:old'])
  })
})
