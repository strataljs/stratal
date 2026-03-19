import { Module } from 'stratal/module'
import { AddTaskCommand } from './commands/add-task.command'
import { CompleteTaskCommand } from './commands/complete-task.command'
import { ListTasksCommand } from './commands/list-tasks.command'
import { ResetTasksCommand } from './commands/reset-tasks.command'
import { ShowTaskCommand } from './commands/show-task.command'
import { TagTaskCommand } from './commands/tag-task.command'
import { TaskService } from './services/task.service'

@Module({
  providers: [
    TaskService,
    AddTaskCommand,
    ListTasksCommand,
    CompleteTaskCommand,
    ShowTaskCommand,
    TagTaskCommand,
    ResetTasksCommand,
  ],
})
export class AppModule {}
