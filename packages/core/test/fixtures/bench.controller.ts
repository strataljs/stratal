import { z } from 'zod'
import { Controller } from '../../src/router/decorators/controller.decorator'
import { Route } from '../../src/router/decorators/route.decorator'
import type { RouterContext } from '../../src/router/router-context'

@Controller('/api/bench')
export class BenchController {
  @Route({
    summary: 'Simple benchmark endpoint',
    response: z.object({ ok: z.boolean() }),
  })
  index(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }
}

@Controller('/api/bench/items')
export class BenchItemsController {
  @Route({
    summary: 'Get item by ID',
    params: z.object({ id: z.string() }),
    response: z.object({ id: z.string(), name: z.string() }),
  })
  show(ctx: RouterContext) {
    const id = ctx.param('id')
    return ctx.json({ id, name: 'bench-item' })
  }

  @Route({
    summary: 'Create item',
    body: z.object({ name: z.string().min(1) }),
    response: z.object({ id: z.string(), name: z.string() }),
  })
  create(ctx: RouterContext) {
    return ctx.json({ id: 'new-1', name: 'bench-item' }, 201)
  }
}
