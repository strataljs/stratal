import { Module } from 'stratal/module'
import { JobsModule } from './jobs/jobs.module'

@Module({
  imports: [JobsModule],
})
export class AppModule {}
