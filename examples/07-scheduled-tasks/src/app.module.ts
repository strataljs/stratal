import { Module } from 'stratal'
import { JobsModule } from './jobs/jobs.module'

@Module({
  imports: [JobsModule],
})
export class AppModule {}
