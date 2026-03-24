import { Transient, inject } from 'stratal/di'
import type { Middleware, RouterContext } from 'stratal/router'
import type { InertiaModuleOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'

@Transient()
export class InertiaMiddleware implements Middleware {
  constructor(
    @inject(INERTIA_TOKENS.Options) private readonly options: InertiaModuleOptions,
  ) { }

  async handle(ctx: RouterContext, next: () => Promise<void>): Promise<void> {
    const isInertia = ctx.header('x-inertia') === 'true'
    const isPrefetch = ctx.header('purpose') === 'prefetch'

    // Store Inertia state on context for services to access
    ctx.c.set('inertia', isInertia)
    ctx.c.set('inertiaPrefetch', isPrefetch)
    ctx.c.set('withoutSsr', false)

    // Version mismatch check on GET requests
    if (isInertia && ctx.c.req.method === 'GET') {
      const clientVersion = ctx.header('x-inertia-version')
      const serverVersion = this.options.version ?? ''

      if (clientVersion && serverVersion && clientVersion !== serverVersion) {
        ctx.c.header('X-Inertia-Location', ctx.c.req.url)
        ctx.c.status(409)
        return
      }
    }

    await next()

    // Add Vary header to all responses
    ctx.c.header('Vary', 'X-Inertia')

    // Convert 302 to 303 for non-GET/HEAD Inertia requests
    if (isInertia) {
      const method = ctx.c.req.method
      const status = ctx.c.res.status

      if (status === 302 && method !== 'GET' && method !== 'HEAD') {
        ctx.c.status(303)
      }
    }
  }
}
