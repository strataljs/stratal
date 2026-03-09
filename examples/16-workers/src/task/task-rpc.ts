import { StratalWorkerEntrypoint } from 'stratal/workers'

import type { Task } from './task.service'
import { TaskService } from './task.service'

/**
 * RPC service binding for cross-worker task lookup.
 * Other workers can call these methods via Service Bindings.
 */
export class TaskRpc extends StratalWorkerEntrypoint {
  async getTask(id: string): Promise<Task | undefined> {
    return this.runInScope(async (container) => {
      const taskService = container.resolve(TaskService)
      return taskService.findById(id)
    })
  }

  async getTasksByUser(userId: string): Promise<Task[]> {
    return this.runInScope(async (container) => {
      const taskService = container.resolve(TaskService)
      return taskService.findByUserId(userId)
    })
  }

  async getTaskCount(): Promise<number> {
    return this.runInScope(async (container) => {
      const taskService = container.resolve(TaskService)
      return taskService.count()
    })
  }
}
