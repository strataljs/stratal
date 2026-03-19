import { inject } from 'tsyringe'
import { Command } from 'stratal/quarry'
import { TaskService } from '../services/task.service'

export class TagTaskCommand extends Command {
  static command = 'task:tag {id : The task ID} {tags* : Tags to add}'
  static description = 'Add tags to a task'

  constructor(
    @inject(TaskService) private readonly tasks: TaskService,
  ) {
    super()
  }

  async handle(): Promise<number | undefined> {
    const id = this.number('id')
    const tags = this.array('tags')

    if (tags.length === 0) {
      this.fail('Provide at least one tag.')
      return 1
    }

    const task = await this.tasks.tag(id, tags)

    if (!task) {
      this.fail(`Task #${id} not found.`)
      return 1
    }

    this.success(`Task #${task.id} tagged with: ${tags.join(', ')}`)
    this.line(`  All tags: ${task.tags.join(', ')}`)
  }
}
