import { inject } from 'tsyringe'
import { Command } from 'stratal/quarry'
import { TaskService } from '../services/task.service'

export class ResetTasksCommand extends Command {
  static command = 'task:reset {--f|force : Skip confirmation}'
  static description = 'Delete all tasks'

  constructor(
    @inject(TaskService) private readonly tasks: TaskService,
  ) {
    super()
  }

  async handle(): Promise<number | undefined> {
    const force = this.boolean('force')

    if (!force) {
      this.warn('This will delete all tasks. Use --force to confirm.')
      return 1
    }

    // Demonstrate this.call() — show the current task list before wiping
    this.info('Current tasks:')
    this.newLine()
    await this.call('task:list')
    this.newLine()

    const count = await this.tasks.reset()
    this.success(`Deleted ${count} task(s).`)
  }
}
