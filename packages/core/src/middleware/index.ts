/**
 * Middleware Consumer Module
 *
 * Provides NestJS-like middleware configuration with fluent API.
 *
 * @example
 * ```typescript
 * import { MiddlewareConfigurable, MiddlewareConsumer } from 'stratal/middleware'
 *
 * @Module({ providers: [...] })
 * export class AppModule implements MiddlewareConfigurable {
 *   configure(consumer: MiddlewareConsumer): void {
 *     consumer
 *       .apply(LoggingMiddleware)
 *       .exclude('/health')
 *       .forRoutes('*')
 *   }
 * }
 * ```
 */

export type {
  MiddlewareConfigEntry,
  MiddlewareRouteTarget,
  MiddlewareConfigurable,
  MiddlewareConsumer,
  MiddlewareBuilder,
  RouteInfo,
} from './types'

export { MiddlewareConsumerImpl, createMiddlewareConsumer } from './middleware-consumer'
export { MiddlewareConfigurationService } from './middleware-configuration.service'
