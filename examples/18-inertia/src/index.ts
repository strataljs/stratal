import 'reflect-metadata';

import { Stratal } from 'stratal';
import { LogLevel } from 'stratal/logger';
import { AppModule } from './app.module';

export default new Stratal({
  module: AppModule, logging: {
    level: LogLevel.ERROR,
    formatter: 'pretty'
  }
})
