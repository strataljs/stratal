import type { Context, MiddlewareHandler } from 'hono'
import type { Constructor } from '../../types'
import { ROUTER_CONTEXT_KEYS } from '../constants'
import { MiddlewareNextCalledMultipleTimesError } from '../errors'
import type { Middleware, Next } from '../middleware.interface'
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
  return async (c: Context<RouterEnv>, next: () => Promise<Response | void>) => {
    const requestContainer = c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER)
    const ctx = new RouterContext(c)

    // Build chain from end to start
    let current = next
    for (let i = classes.length - 1; i >= 0; i--) {
      const prevNext = current
      const middleware = requestContainer.resolve<Middleware>(classes[i])
      const middlewareClass = classes[i]
      current = () => {
        let called = false
        const guardedNext: Next = () => {
          if (called) {
            const err = new MiddlewareNextCalledMultipleTimesError(middlewareClass.name ?? 'anonymous')
            console.error('[STRATAL DEBUG] next() called multiple times for ' + middlewareClass.name)
            console.error('[STRATAL DEBUG] Stack trace:', new Error().stack)
            return Promise.reject(err)
          }
          called = true
          return prevNext() as Promise<void>
        }
        return middleware.handle(ctx, guardedNext) as Promise<void>
      }
    }

    const result = await current()

    if (result instanceof Response) {
      return result  // return to Hono
    }
  }
}
