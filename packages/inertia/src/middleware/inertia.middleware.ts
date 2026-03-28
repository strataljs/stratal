import { Transient, inject } from 'stratal/di'
import type { Middleware, Next, RouterContext } from 'stratal/router'
import type { InertiaModuleOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'

@Transient()
export class InertiaMiddleware implements Middleware {
  constructor(
    @inject(INERTIA_TOKENS.Options) private readonly options: InertiaModuleOptions,
  ) { }

  async handle(ctx: RouterContext, next: Next): Promise<void> {
    const isInertia = ctx.header('x-inertia') === 'true'
    const isPrefetch = ctx.header('purpose') === 'prefetch'

    // Store Inertia state on context for services to access
    ctx.c.set('inertia', isInertia)
    ctx.c.set('inertiaPrefetch', isPrefetch)
    ctx.c.set('withoutSsr', false)

    // Initialize flash buckets
    ctx.c.set('inertiaFlashOut', {})

    // Read incoming flash data from store (read-only — no response headers touched)
    let hadFlash = false
    if (this.options.flash) {
      const flashData = await this.options.flash.store.read(ctx)
      hadFlash = Object.keys(flashData).length > 0
      ctx.c.set('inertiaFlash', flashData)
    } else {
      ctx.c.set('inertiaFlash', {})
    }

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

    // Flash cookie operations AFTER next() — ctx.c.res is now the actual Response,
    // so setSignedCookie/deleteCookie will modify the real response headers.
    if (this.options.flash) {
      const flashOut = ctx.c.get('inertiaFlashOut')
      if (Object.keys(flashOut).length > 0) {
        // New flash data was set during this request — write cookie for next request
        await this.options.flash.store.write(ctx, flashOut)
      } else if (hadFlash) {
        // Flash was consumed but no new flash set — clear the cookie
        await this.options.flash.store.clear(ctx)
      }
    }

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
