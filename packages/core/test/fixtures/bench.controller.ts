import { boolean, minLength, object, string } from 'zod/mini'
import { Controller } from '../../src/router/decorators/controller.decorator'
import { Route } from '../../src/router/decorators/route.decorator'
import type { RouterContext } from '../../src/router/router-context'

@Controller('/api/bench')
export class BenchController {
  @Route({
    summary: 'Simple benchmark endpoint',
    response: object({ ok: boolean() }),
  })
  index(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }
}

@Controller('/api/bench/items')
export class BenchItemsController {
  @Route({
    summary: 'Get item by ID',
    params: object({ id: string() }),
    response: object({ id: string(), name: string() }),
  })
  show(ctx: RouterContext) {
    const id = ctx.param('id')
    return ctx.json({ id, name: 'bench-item' })
  }

  @Route({
    summary: 'Create item',
    body: object({ name: string().check(minLength(1)) }),
    response: object({ id: string(), name: string() }),
  })
  create(ctx: RouterContext) {
    return ctx.json({ id: 'new-1', name: 'bench-item' }, 201)
  }
}
