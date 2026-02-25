import { MiddlewareConfigurable, MiddlewareConsumer, Module } from 'stratal'
import { HelloController } from './hello/hello.controller'
import { HealthController } from './health/health.controller'
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware'

@Module({
  controllers: [HelloController, HealthController],
})
export class AppModule implements MiddlewareConfigurable {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestLoggerMiddleware)
      .exclude('/api/health')
      .forRoutes('*')
  }
}
