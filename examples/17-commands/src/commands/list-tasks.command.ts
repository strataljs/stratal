import { inject } from 'tsyringe'
import { Command } from 'stratal/quarry'
import { TaskService } from '../services/task.service'

export class ListTasksCommand extends Command {
  static command = 'task:list {--s|status= : Filter by status (pending, done)}'
  static description = 'List all tasks'

  constructor(
    @inject(TaskService) private readonly tasks: TaskService,
  ) {
    super()
  }

  async handle(): Promise<number | undefined> {
    const status = this.string('status')
    let tasks = await this.tasks.list()

    if (status) {
      tasks = tasks.filter((t) => t.status === status)
    }

    if (tasks.length === 0) {
      this.info('No tasks found.')
      return
    }

    this.table(
      ['ID', 'Title', 'Priority', 'Status', 'Tags'],
      tasks.map((t) => [
        String(t.id),
        t.title,
        t.priority,
        t.status,
        t.tags.join(', ') || '-',
      ]),
    )
  }
}
