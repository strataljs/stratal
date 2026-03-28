import type { Context, MiddlewareHandler } from 'hono'
import type { Constructor } from '../../types'
import { ROUTER_CONTEXT_KEYS } from '../constants'
import type { Middleware } from '../middleware.interface'
import { RouterContext } from '../router-context'
import type { RouterEnv } from '../types'

/**
 * Create a Hono middleware handler that executes a chain of Stratal middleware classes.
 *
 * Each middleware is resolved from the request-scoped container per request,
 * then executed in order (first registered = outermost in the chain).
 *
 * @param classes - Middleware classes to chain
 * @returns Hono middleware handler
 */
export function createMiddlewareChain(
  classes: Constructor<Middleware>[]
): MiddlewareHandler<RouterEnv> {
  return async (c: Context<RouterEnv>, next: () => Promise<void>) => {
    const requestContainer = c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER)
    const ctx = new RouterContext(c)

    // Build chain from end to start
    let current = next
    for (let i = classes.length - 1; i >= 0; i--) {
      const prevNext = current
      const middleware = requestContainer.resolve<Middleware>(classes[i])
      current = () => middleware.handle(ctx, prevNext) as Promise<void>
    }

    await current()
  }
}
