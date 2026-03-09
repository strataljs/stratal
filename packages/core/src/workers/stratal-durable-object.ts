import { DurableObject } from 'cloudflare:workers'
import type { Container } from '../di/container'
import { DI_TOKENS } from '../di/tokens'
import type { StratalEnv } from '../env'
import { runInScope } from './run-in-scope'

/**
 * Base class for Durable Objects with full DI access.
 *
 * Extends Cloudflare's `DurableObject` and provides a `runInScope()` helper
 * that creates a request-scoped container with `DurableObjectState` and
 * `DurableObjectId` tokens registered.
 *
 * @example
 * ```typescript
 * import { StratalDurableObject } from 'stratal/workers'
 *
 * export class Counter extends StratalDurableObject {
 *   async increment() {
 *     return this.runInScope(async (container) => {
 *       const svc = container.resolve(CounterService)
 *       return svc.increment()
 *     })
 *   }
 * }
 * ```
 */
export abstract class StratalDurableObject<
  Env extends StratalEnv = StratalEnv
> extends DurableObject<Env> {
  protected async runInScope<T>(
    callback: (container: Container) => T | Promise<T>
  ): Promise<T> {
    return runInScope(async (requestContainer) => {
      requestContainer.registerValue(DI_TOKENS.DurableObjectState, this.ctx)
      requestContainer.registerValue(DI_TOKENS.DurableObjectId, this.ctx.id)
      return callback(requestContainer)
    })
  }
}
