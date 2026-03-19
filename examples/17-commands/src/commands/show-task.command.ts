import { inject } from 'tsyringe'
import { Command } from 'stratal/quarry'
import { TaskService } from '../services/task.service'

export class ShowTaskCommand extends Command {
  static command = 'task:show {id?} {format=short : Output format (short or detailed)}'
  static description = 'Show task details'

  constructor(
    @inject(TaskService) private readonly tasks: TaskService,
  ) {
    super()
  }

  async handle(): Promise<number | undefined> {
    const id = this.number('id')
    const format = this.string('format') || 'short'

    if (!id) {
      this.info('Usage: task:show <id> [format]')
      this.comment('Provide a task ID to view its details.')
      return
    }

    const task = await this.tasks.find(id)

    if (!task) {
      this.fail(`Task #${id} not found.`)
      return 1
    }

    if (format === 'detailed') {
      this.info(`Task #${task.id}`)
      this.line(`  Title:    ${task.title}`)
      this.line(`  Priority: ${task.priority}`)
      this.line(`  Status:   ${task.status}`)
      this.line(`  Tags:     ${task.tags.length > 0 ? task.tags.join(', ') : 'none'}`)
      this.line(`  Created:  ${task.createdAt}`)
    } else {
      this.info(`#${task.id} [${task.status}] ${task.title}`)
    }
  }
}
