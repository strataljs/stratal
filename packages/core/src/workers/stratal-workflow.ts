import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { Container } from '../di/container'
import type { StratalEnv } from '../env'
import { runInScope } from './run-in-scope'

/**
 * Base class for Cloudflare Workflows with full DI access.
 *
 * Extends Cloudflare's `WorkflowEntrypoint` and provides a `runInScope()` helper
 * that creates a request-scoped DI container.
 *
 * @example
 * ```typescript
 * import { StratalWorkflow } from 'stratal/workers'
 *
 * export class MyWorkflow extends StratalWorkflow<Env, { userId: string }> {
 *   async run(event: WorkflowEvent<{ userId: string }>, step: WorkflowStep) {
 *     await this.runInScope(async (container) => {
 *       const svc = container.resolve(UserService)
 *       await svc.process(event.payload.userId)
 *     })
 *   }
 * }
 * ```
 */
export abstract class StratalWorkflow<
  Env extends StratalEnv = StratalEnv,
  Params = unknown
> extends WorkflowEntrypoint<Env, Params> {
  protected runInScope<T>(
    callback: (container: Container) => T | Promise<T>
  ): Promise<T> {
    return runInScope(callback)
  }
}
