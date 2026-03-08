import "reflect-metadata"

import { Stratal } from 'stratal'
import { LogLevel } from 'stratal/logger'
import { TestAppModule } from './app.module'

export default new Stratal({
  module: TestAppModule,
  logging: { level: LogLevel.ERROR },
})
