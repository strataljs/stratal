import { Module } from 'stratal/module'

import { TaskController, TaskCountController, TaskProcessController } from './task.controller'
import { TaskService } from './task.service'

@Module({
  controllers: [TaskCountController, TaskProcessController, TaskController],
  providers: [TaskService],
})
export class TaskModule {}
