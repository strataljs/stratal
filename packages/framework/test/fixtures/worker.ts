import { LogLevel } from 'stratal/logger'
import { StratalWorker } from 'stratal/worker'
import type { ApplicationConfig } from 'stratal'
import { TestAppModule } from './app.module'

export default class TestWorker extends StratalWorker {
  protected configure(): ApplicationConfig {
    return {
      module: TestAppModule,
      logging: { level: LogLevel.ERROR },
    }
  }
}
