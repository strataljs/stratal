import { Transient } from 'stratal/di'
import { Middleware } from 'stratal/middleware'
import { RouterContext } from 'stratal/router'

@Transient()
export class RequestLoggerMiddleware implements Middleware {
  async handle(ctx: RouterContext, next: () => Promise<void>) {
    const start = Date.now()
    const method = ctx.c.req.method
    const path = ctx.c.req.path

    console.log(`--> ${method} ${path}`)

    await next()

    const duration = Date.now() - start
    console.log(`<-- ${method} ${path} ${ctx.c.res.status} (${duration}ms)`)
  }
}
