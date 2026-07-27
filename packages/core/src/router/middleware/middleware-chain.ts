import type { Context, MiddlewareHandler } from 'hono'
import type { Constructor } from '../../types'
import { ROUTER_CONTEXT_KEYS } from '../constants'
import { RouterError } from '../router.error'
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
      const middlewareClass = classes[i]
      current = async () => {
        const middleware = requestContainer.resolve<Middleware>(middlewareClass)
        let called = false
        const guardedNext: Next = () => {
          if (called) {
            return Promise.reject(
              new RouterError(`Middleware "${middlewareClass.name ?? 'anonymous'}" called next() multiple times`)
            )
          }
          called = true
          return prevNext()
        }

        const result = await middleware.handle(ctx, guardedNext)

        // A middleware that returns a Response is short-circuiting the request.
        // Finalize it on the Hono context at this boundary so it survives even
        // when an *outer* middleware forwards control with `await next()`
        // instead of `return next()` and drops the returned value — which would
        // otherwise leave the context unfinalized and make Hono throw
        // "Context is not finalized". Outer middlewares that don't short-circuit
        // return void, so `result instanceof Response` is false and they never
        // reach this branch to override an inner middleware's already-set
        // response. (A forwarding middleware that `return next()`s re-sets the
        // very same Response object, which is harmless.)
        if (result instanceof Response) {
          c.res = result
        }

        return result
      }
    }

    const result = await current()

    if (result instanceof Response) {
      return result  // return to Hono
    }
  }
}
