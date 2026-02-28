import { LogLevel } from '../../src/logger/contracts'
import { StratalWorker } from '../../src/worker/stratal-worker'
import type { ApplicationConfig } from '../../src/application'
import { BenchAppModule } from './app.module'

export default class BenchWorker extends StratalWorker {
  protected configure(): ApplicationConfig {
    return {
      module: BenchAppModule,
      logging: { level: LogLevel.ERROR },
    }
  }
}
