import { Module } from 'stratal/module'

import { TaskModule } from './task/task.module'

@Module({
  imports: [TaskModule],
})
export class AppModule {}
