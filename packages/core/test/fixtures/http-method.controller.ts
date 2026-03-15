import { z } from '../../src/i18n/validation'
import { Module } from '../../src/module/module.decorator'
import { Controller } from '../../src/router/decorators/controller.decorator'
import { All, Delete, Get, Patch, Post, Put } from '../../src/router/decorators/http-method.decorator'
import { Route } from '../../src/router/decorators/route.decorator'
import type { RouterContext } from '../../src/router/router-context'

@Controller('/api/http-methods', { tags: ['HttpMethods'] })
export class HttpMethodController {
  @Get('/', {
    response: z.object({ items: z.array(z.string()) }),
    summary: 'List items',
  })
  listItems(ctx: RouterContext) {
    return ctx.json({ items: ['a', 'b'] })
  }

  // Static path must come before parametric /:id to avoid conflicts
  @Get('/search', {
    query: z.object({ q: z.string().min(1), limit: z.string().optional() }),
    response: z.object({ results: z.array(z.string()), query: z.string() }),
  })
  searchItems(ctx: RouterContext) {
    const query = ctx.query<{ q: string; limit?: string }>()
    return ctx.json({ results: ['result1'], query: query.q })
  }

  @Get('/:id', {
    params: z.object({ id: z.string() }),
    response: z.object({ id: z.string() }),
  })
  getItem(ctx: RouterContext) {
    const id = ctx.param('id')
    return ctx.json({ id })
  }

  @Post('/', {
    body: z.object({ name: z.string().min(1) }),
    response: z.object({ id: z.string(), name: z.string() }),
    statusCode: 201,
  })
  async createItem(ctx: RouterContext) {
    const body = await ctx.body<{ name: string }>()
    return ctx.json({ id: '1', name: body.name }, 201)
  }

  @Put('/:id', {
    params: z.object({ id: z.string() }),
    body: z.object({ name: z.string().min(1) }),
    response: z.object({ id: z.string(), name: z.string() }),
  })
  async updateItem(ctx: RouterContext) {
    const id = ctx.param('id')
    const body = await ctx.body<{ name: string }>()
    return ctx.json({ id, name: body.name })
  }

  @Patch('/:id', {
    params: z.object({ id: z.string() }),
    body: z.object({ name: z.string().optional() }),
    response: z.object({ id: z.string(), name: z.string() }),
  })
  async patchItem(ctx: RouterContext) {
    const id = ctx.param('id')
    const body = await ctx.body<{ name?: string }>()
    return ctx.json({ id, name: body.name ?? 'default' })
  }

  @Delete('/:id', {
    params: z.object({ id: z.string() }),
    response: z.object({ deleted: z.boolean() }),
  })
  deleteItem(ctx: RouterContext) {
    return ctx.json({ deleted: true })
  }

  @Post('/:id/avatar', {
    params: z.object({ id: z.string() }),
    body: z.object({ url: z.string().url() }),
    response: z.object({ id: z.string(), avatarUrl: z.string() }),
    statusCode: 201,
  })
  async uploadAvatar(ctx: RouterContext) {
    const id = ctx.param('id')
    const body = await ctx.body<{ url: string }>()
    return ctx.json({ id, avatarUrl: body.url }, 201)
  }
}

@Controller('/api/catch-all')
export class AllMethodController {
  @All('/:path{.+}')
  handle(ctx: RouterContext) {
    return ctx.json({ method: ctx.c.req.method, path: ctx.c.req.path })
  }
}

@Controller('/api/mixed')
export class MixedController {
  @Route({ response: z.object({ ok: z.boolean() }) })
  index(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }

  @Get('/custom', { response: z.object({ ok: z.boolean() }) })
  custom(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }
}

@Module({
  controllers: [HttpMethodController, AllMethodController],
})
export class HttpMethodAppModule {}
