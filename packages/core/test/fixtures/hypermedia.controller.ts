import { z } from '../../src/i18n/validation'
import { Module } from '../../src/module/module.decorator'
import { Controller } from '../../src/router/decorators/controller.decorator'
import { Route } from '../../src/router/decorators/route.decorator'
import type { RouterContext } from '../../src/router/router-context'
import { cursorPaginationQuerySchema, paginationQuerySchema } from '../../src/router/schemas/common.schemas'

const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const idParamSchema = z.object({
  id: z.string(),
})

@Controller('/api/resources', { tags: ['Resources'] })
export class HypermediaController {
  @Route({ response: itemSchema, resource: true, params: idParamSchema })
  show(ctx: RouterContext) {
    const id = ctx.param('id')
    const item = { id, name: 'Test Item' }
    return ctx.resource(item, {
      links: ctx.links.resource({ id }),
    })
  }

  @Route({ query: paginationQuerySchema, response: itemSchema, resource: 'paginated' })
  index(ctx: RouterContext) {
    const { page, limit } = ctx.query<{ page: number; limit: number }>()
    const items = [{ id: '1', name: 'Item 1' }, { id: '2', name: 'Item 2' }]
    return ctx.collection(items, { page, limit, total: 2, totalPages: 1 })
  }

  @Route({ response: itemSchema })
  create(ctx: RouterContext) {
    return ctx.json({ id: '1', name: 'Created' }, 201)
  }
}

@Controller('/api/plain')
export class PlainController {
  @Route({ response: z.object({ status: z.string() }) })
  index(ctx: RouterContext) {
    return ctx.json({ status: 'ok' })
  }
}

@Controller('/api/cursored')
export class CursorController {
  @Route({ query: cursorPaginationQuerySchema, response: itemSchema, resource: 'paginated' })
  index(ctx: RouterContext) {
    const { cursor, limit } = ctx.query<{ cursor?: string; limit: number }>()

    const hasMore = !cursor
    const data = hasMore
      ? [{ id: '1', name: 'Item 1' }, { id: '2', name: 'Item 2' }]
      : [{ id: '3', name: 'Item 3' }]
    const nextCursor = hasMore ? 'cursor-after-2' : null

    return ctx.cursorCollection({ data, nextCursor, hasMore, limit })
  }
}

@Controller('/api/related')
export class CrossLinkController {
  @Route({ response: z.object({ id: z.string() }), resource: true, params: idParamSchema })
  show(ctx: RouterContext) {
    const id = ctx.param('id')
    return ctx.resource({ id }, {
      links: {
        self: ctx.links.self(),
        resources: ctx.links.action(HypermediaController, 'index'),
      },
    })
  }
}

@Module({
  controllers: [HypermediaController, CursorController, PlainController, CrossLinkController],
})
export class HypermediaAppModule { }
