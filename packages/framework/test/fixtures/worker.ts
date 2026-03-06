import { LogLevel } from 'stratal/logger'
import { Stratal } from 'stratal'
import { TestAppModule } from './app.module'

export default new Stratal({
  module: TestAppModule,
  logging: { level: LogLevel.ERROR },
})
