import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { StratalWorkflow } from 'stratal/workers';

import { LOGGER_TOKENS, LoggerService } from 'stratal/logger';
import { TaskService } from './task.service';

export interface TaskWorkflowParams {
  taskId: string
}

/**
 * Multi-step workflow that processes a task through validation, processing,
 * and completion stages — each step uses DI to access TaskService.
 */
export class TaskWorkflow extends StratalWorkflow<Env, TaskWorkflowParams> {
  async run(
    event: WorkflowEvent<TaskWorkflowParams>,
    step: WorkflowStep
  ): Promise<{ taskId: string; status: string }> {
    const { taskId } = event.payload

    // Step 1: Validate the task exists
    const task = await step.do('validate-task', async () => {
      return this.runInScope(async (container) => {
        const taskService = container.resolve(TaskService)
        const logger = container.resolve<LoggerService>(LOGGER_TOKENS.LoggerService);

        const found = taskService.findById(taskId)
        if (!found) {
          throw new Error(`Task ${taskId} not found`)
        }
        logger.info(`[Workflow] Validating task: ${found.title}`)
        return found
      })
    })

    // Step 2: Process the task
    await step.do('process-task', async () => {
      return this.runInScope(async (container) => {
        const taskService = container.resolve(TaskService)
        const logger = container.resolve<LoggerService>(LOGGER_TOKENS.LoggerService);

        taskService.updateStatus(taskId, 'processing')
        logger.info(`[Workflow] Processing task: ${task.title}`)
      })
    })

    // Step 3: Mark as completed
    await step.do('complete-task', async () => {
      return this.runInScope(async (container) => {
        const taskService = container.resolve(TaskService)
        const logger = container.resolve<LoggerService>(LOGGER_TOKENS.LoggerService);
        taskService.updateStatus(taskId, 'completed')
        logger.info(`[Workflow] Completed task: ${task.title}`)
      })
    })

    return { taskId, status: 'completed' }
  }
}
