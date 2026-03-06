import { LogLevel } from '../../src/logger/contracts'
import { Stratal } from '../../src/stratal'
import { BenchAppModule } from './app.module'

export default new Stratal({
  module: BenchAppModule,
  logging: { level: LogLevel.ERROR },
})
