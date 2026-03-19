import { Command } from 'stratal/quarry'
import { inject } from 'tsyringe'
import { TaskService } from '../services/task.service'

export class AddTaskCommand extends Command {
  static command = 'task:add {title : The task title} {--p|priority= : Task priority (low, normal, high)}'
  static description = 'Add a new task'

  constructor(
    @inject(TaskService) private readonly tasks: TaskService,
  ) {
    super()
  }

  async handle(): Promise<number | undefined> {
    const title = this.string('title')
    const priority = this.string('priority') || 'normal'

    const task = await this.tasks.add(title, priority)

    this.success(`Task #${task.id} created: "${task.title}" [${task.priority}]`)

    return undefined;
  }
}
