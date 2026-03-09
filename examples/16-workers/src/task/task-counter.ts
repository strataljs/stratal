import { StratalDurableObject } from 'stratal/workers'

import { LOGGER_TOKENS, LoggerService } from 'stratal/logger'
import { TaskService } from './task.service'

/**
 * Durable Object that tracks per-user task counts using DO storage and DI.
 */
export class TaskCounter extends StratalDurableObject {
  async increment(userId: string): Promise<number> {
    const current = (await this.ctx.storage.get<number>('count')) ?? 0
    const next = current + 1
    await this.ctx.storage.put('count', next)

    // Use DI to log via TaskService
    await this.runInScope(async (container) => {
      const taskService = container.resolve(TaskService)
      const logger = container.resolve<LoggerService>(LOGGER_TOKENS.LoggerService);

      logger.info(
        `[TaskCounter] User ${userId} now has ${next} tasks (total in memory: ${taskService.count()})`
      )
    })

    return next
  }

  async getCount(): Promise<number> {
    return (await this.ctx.storage.get<number>('count')) ?? 0
  }

  async reset(): Promise<void> {
    await this.ctx.storage.put('count', 0)
  }
}
