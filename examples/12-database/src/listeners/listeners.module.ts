import { Module } from 'stratal/module'

import { TaskListener } from './task.listener'

@Module({
  providers: [TaskListener],
})
export class ListenersModule {}
