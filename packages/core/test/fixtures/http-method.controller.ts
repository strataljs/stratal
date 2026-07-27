import { array, boolean, minLength, object, optional, string, url } from 'zod/mini'
import { Module } from '../../src/module/module.decorator'
import { Controller } from '../../src/router/decorators/controller.decorator'
import { All, Delete, Get, Patch, Post, Put } from '../../src/router/decorators/http-method.decorator'
import { Route } from '../../src/router/decorators/route.decorator'
import type { RouterContext } from '../../src/router/router-context'

@Controller('/api/http-methods', { tags: ['HttpMethods'] })
export class HttpMethodController {
  @Get('/', {
    response: object({ items: array(string()) }),
    summary: 'List items',
  })
  listItems(ctx: RouterContext) {
    return ctx.json({ items: ['a', 'b'] })
  }

  // Static path must come before parametric /:id to avoid conflicts
  @Get('/search', {
    query: object({ q: string().check(minLength(1)), limit: optional(string()) }),
    response: object({ results: array(string()), query: string() }),
  })
  searchItems(ctx: RouterContext) {
    const query = ctx.query<{ q: string; limit?: string }>()
    return ctx.json({ results: ['result1'], query: query.q })
  }

  @Get('/:id', {
    params: object({ id: string() }),
    response: object({ id: string() }),
  })
  getItem(ctx: RouterContext) {
    const id = ctx.param('id')
    return ctx.json({ id })
  }

  @Post('/', {
    body: object({ name: string().check(minLength(1)) }),
    response: object({ id: string(), name: string() }),
    statusCode: 201,
  })
  async createItem(ctx: RouterContext) {
    const body = await ctx.body<{ name: string }>()
    return ctx.json({ id: '1', name: body.name }, 201)
  }

  @Put('/:id', {
    params: object({ id: string() }),
    body: object({ name: string().check(minLength(1)) }),
    response: object({ id: string(), name: string() }),
  })
  async updateItem(ctx: RouterContext) {
    const id = ctx.param('id')
    const body = await ctx.body<{ name: string }>()
    return ctx.json({ id, name: body.name })
  }

  @Patch('/:id', {
    params: object({ id: string() }),
    body: object({ name: optional(string()) }),
    response: object({ id: string(), name: string() }),
  })
  async patchItem(ctx: RouterContext) {
    const id = ctx.param('id')
    const body = await ctx.body<{ name?: string }>()
    return ctx.json({ id, name: body.name ?? 'default' })
  }

  @Delete('/:id', {
    params: object({ id: string() }),
    response: object({ deleted: boolean() }),
  })
  deleteItem(ctx: RouterContext) {
    return ctx.json({ deleted: true })
  }

  @Post('/:id/avatar', {
    params: object({ id: string() }),
    body: object({ url: url() }),
    response: object({ id: string(), avatarUrl: string() }),
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
  @Route({ response: object({ ok: boolean() }) })
  index(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }

  @Get('/custom', { response: object({ ok: boolean() }) })
  custom(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }
}

@Module({
  controllers: [HttpMethodController, AllMethodController],
})
export class HttpMethodAppModule {}
