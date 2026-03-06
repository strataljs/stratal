import { Module } from 'stratal/module'

import { TasksController } from './tasks.controller'

@Module({
  controllers: [TasksController],
})
export class TasksModule {}
