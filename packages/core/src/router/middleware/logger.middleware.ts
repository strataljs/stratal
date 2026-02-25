import type { MiddlewareHandler } from 'hono'
import type { LoggerService } from '../../logger'

/**
 * Create a Hono middleware that logs HTTP requests using our Logger service
 *
 * Logs request method, path, status code, and duration in milliseconds.
 * Format: [HTTP] METHOD /path -> STATUS (duration ms)
 *
 * @param logger - Logger service instance
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * const logger = container.resolve<LoggerService>(LOGGER_TOKENS.LoggerService)
 * app.use('*', createLoggerMiddleware(logger))
 * ```
 */
export function createLoggerMiddleware(logger: LoggerService): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now()
    const method = c.req.method
    const path = c.req.path

    await next()

    const duration = Date.now() - start
    const status = c.res.status

    logger.info(`[HTTP] ${method} ${path} -> ${status}`, {
      method,
      path,
      status,
      duration,
    })
  }
}
