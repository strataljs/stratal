import type { Container } from '../di/container'
import type { Stratal } from '../stratal'

/**
 * Shared helper that creates a request-scoped DI container by accessing the
 * Stratal instance via the `exports` binding from `cloudflare:workers`.
 *
 * Works with Durable Objects, Workflows, and WorkerEntrypoints.
 */
export async function runInScope<T>(
  callback: (container: Container) => T | Promise<T>
): Promise<T> {
  const { exports } = await import('cloudflare:workers')
  const stratal = (exports as unknown as { default: Stratal }).default
  const app = await stratal.getApplication()
  const mockCtx = app.createMockRouterContext('en')
  return app.container.runInRequestScope(mockCtx, callback)
}
