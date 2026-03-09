import type { Container } from '../di/container'
import { Stratal } from '../stratal'

/**
 * Shared helper that creates a request-scoped DI container by accessing the
 * Stratal Application via the static singleton.
 *
 * Works with Durable Objects, Workflows, and WorkerEntrypoints.
 */
export async function runInScope<T>(
  callback: (container: Container) => T | Promise<T>
): Promise<T> {
  const app = await Stratal.resolveApplication()
  const mockCtx = app.createMockRouterContext('en')
  return app.container.runInRequestScope(mockCtx, callback)
}
