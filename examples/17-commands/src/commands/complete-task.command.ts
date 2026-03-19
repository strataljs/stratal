import { inject } from 'tsyringe'
import { Command } from 'stratal/quarry'
import { TaskService } from '../services/task.service'

export class CompleteTaskCommand extends Command {
  static command = 'task:complete {id : The task ID} {--f|force} {--n|note= : Add a note}'
  static description = 'Mark a task as done'
  static aliases = ['task:done']

  constructor(
    @inject(TaskService) private readonly tasks: TaskService,
  ) {
    super()
  }

  async handle(): Promise<number | undefined> {
    const id = this.number('id')
    const force = this.boolean('force')
    const note = this.string('note')

    const task = await this.tasks.find(id)

    if (!task) {
      this.fail(`Task #${id} not found.`)
      return 1
    }

    if (task.status === 'done' && !force) {
      this.warn(`Task #${id} is already done. Use --force to update anyway.`)
      return 1
    }

    const updated = await this.tasks.complete(id, note || undefined)
    this.success(`Task #${updated!.id} marked as done.`)
  }
}
