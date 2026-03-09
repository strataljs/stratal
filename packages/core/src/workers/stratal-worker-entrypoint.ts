import { WorkerEntrypoint } from 'cloudflare:workers'
import type { Container } from '../di/container'
import type { StratalEnv } from '../env'
import { runInScope } from './run-in-scope'

/**
 * Base class for Cloudflare WorkerEntrypoints (Service Bindings / RPC) with full DI access.
 *
 * Extends Cloudflare's `WorkerEntrypoint` and provides a `runInScope()` helper
 * that creates a request-scoped DI container.
 *
 * @example
 * ```typescript
 * import { StratalWorkerEntrypoint } from 'stratal/workers'
 *
 * export class AuthRpc extends StratalWorkerEntrypoint {
 *   async verifyToken(token: string) {
 *     return this.runInScope(async (container) => {
 *       const auth = container.resolve(AuthService)
 *       return auth.verify(token)
 *     })
 *   }
 * }
 * ```
 */
export abstract class StratalWorkerEntrypoint<
  Env extends StratalEnv = StratalEnv
> extends WorkerEntrypoint<Env> {
  protected runInScope<T>(
    callback: (container: Container) => T | Promise<T>
  ): Promise<T> {
    return runInScope(callback)
  }
}
