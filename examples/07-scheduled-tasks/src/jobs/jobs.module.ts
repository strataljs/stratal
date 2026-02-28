import { Module } from 'stratal/module'
import { CleanupJob } from './cleanup.job'
import { HeartbeatJob } from './heartbeat.job'

@Module({
  jobs: [CleanupJob, HeartbeatJob],
})
export class JobsModule {}
