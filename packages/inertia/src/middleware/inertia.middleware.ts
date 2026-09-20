import { Transient, inject } from 'stratal/di'
import type { Middleware, Next, RouterContext } from 'stratal/router'
import type { InertiaModuleOptions } from '../inertia.options'
import { INERTIA_TOKENS } from '../inertia.tokens'
import { INERTIA_VARY_HEADERS } from '../types'

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
        // A real Response, not `header()` + `status()` and a bare return. A middleware that
        // short-circuits without one leaves `c.res` unset, and the outermost `no-store` fallback
        // then reads `c.res.headers` off `undefined` — so the client received a 500 where the
        // whole point of this branch is to send a 409 the Inertia client turns into a reload. This
        // path had therefore never worked; every other short-circuit in the framework returns
        // `c.redirect(...)`, which is a Response.
        //
        // `X-Inertia-Version` rides along because Inertia's client reads it back off this response
        // to decide whether the location visit is a VERSION change. That flag is what lets an app
        // tell "you are out of date, reload" apart from an ordinary external redirect — it is
        // carried on the cancelable `location` event — and it also stops the client reloading the
        // page underneath an async visit.
        ctx.c.res = new Response(null, {
          status: 409,
          headers: {
            'X-Inertia-Location': ctx.c.req.url,
            'X-Inertia-Version': serverVersion,
          },
        })
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

    // Skip response mutation for statuses Hono can't clone (e.g. 101 WebSocket
    // upgrades, Response.error()'s status 0). `c.header()` would otherwise call
    // `new Response(c.res.body, c.res)` and the Response constructor throws a
    // RangeError for any status outside 200-599.
    const status = ctx.c.res?.status
    if (typeof status !== 'number' || status < 200 || status > 599) return

    // Add Vary header to all responses — by *union*, never by replacement.
    // This runs after `next()`, so the handler (and Stratal's
    // `applyCacheDecision`, which stamps `@Cacheable`'s `vary: [...]` from
    // inside the route handler) has already put its own names on the
    // response. `c.header('Vary', 'X-Inertia')` is a set, not an append, so
    // overwriting here would silently drop e.g. `Accept-Language` and collapse
    // every language onto a single cache entry.
    const declaredVary = (ctx.c.res.headers.get('Vary') ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)

    // Every name in INERTIA_VARY_HEADERS, not just `X-Inertia`: a partial reload
    // sends `X-Inertia: true` like any other Inertia request, so a response
    // keyed on that alone would be interchangeable with one carrying a
    // different set of props. See the constant for the full argument.
    const seen = new Set(declaredVary.map((name) => name.toLowerCase()))
    const missing = INERTIA_VARY_HEADERS.filter((name) => !seen.has(name.toLowerCase()))
    ctx.c.header('Vary', [...missing, ...declaredVary].join(', '))

    // Convert 302 to 303 for non-GET/HEAD Inertia requests
    if (isInertia && status === 302) {
      const method = ctx.c.req.method
      if (method !== 'GET' && method !== 'HEAD') {
        ctx.c.status(303)
      }
    }
  }
}
