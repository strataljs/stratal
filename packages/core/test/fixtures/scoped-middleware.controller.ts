import { Transient } from '../../src/di/decorators'
import { Module } from '../../src/module/module.decorator'
import { Controller } from '../../src/router/decorators/controller.decorator'
import { Get } from '../../src/router/decorators/http-method.decorator'
import type { Middleware, Next } from '../../src/router/middleware.interface'
import { type RouteConfigurable, type Router } from '../../src/router/router'
import type { RouterContext } from '../../src/router/router-context'
import { object, string } from 'zod/mini'

/**
 * Module-level scoped middleware that captures `ctx.param('organizationId')`
 * onto the Hono context. The controllers echo it back so tests can verify:
 *   1. the middleware actually ran for the request, and
 *   2. it could read the *validated* path param (`c.req.valid('param')`),
 *      which only exists after the route's request validators have run.
 *
 * If scoped middleware were ordered before validators, `ctx.param()` would
 * crash on `valid('param')` being undefined.
 */
@Transient()
class ScopedTagMiddleware implements Middleware {
  async handle(ctx: RouterContext, next: Next): Promise<void> {
    ctx.c.set('scopedTag' as never, 'group-mw-ran' as never)
    ctx.c.set('scopedOrganizationId' as never, ctx.param('organizationId') as never)
    await next()
  }
}

@Controller('/', { name: 'index.' })
export class ScopedIndexController {
  @Get('/', { name: 'show' })
  show(ctx: RouterContext) {
    return ctx.json({
      scopedTag: ctx.c.get('scopedTag' as never) ?? null,
      scopedOrganizationId: ctx.c.get('scopedOrganizationId' as never) ?? null,
    })
  }
}

@Controller('/ui', { name: 'ui.' })
export class ScopedSiblingController {
  @Get('/', { name: 'show' })
  show(ctx: RouterContext) {
    return ctx.json({
      scopedTag: ctx.c.get('scopedTag' as never) ?? null,
      scopedOrganizationId: ctx.c.get('scopedOrganizationId' as never) ?? null,
    })
  }
}

@Module({
  providers: [ScopedTagMiddleware],
  controllers: [ScopedIndexController, ScopedSiblingController],
})
export class ScopedMiddlewareAppModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    router.group(
      [ScopedIndexController, ScopedSiblingController],
      (child) => {
        child
          .prefix('/admin/:organizationId', object({ organizationId: string() }))
          .name('admin.')
          .middleware(ScopedTagMiddleware)
      },
    )
  }
}
