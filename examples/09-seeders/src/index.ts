import { Stratal } from 'stratal'
import { LogLevel } from 'stratal/logger'
import { AppModule } from './app.module'

export default new Stratal({
  module: AppModule,
  logging: { formatter: 'pretty', level: LogLevel.ERROR }
})
