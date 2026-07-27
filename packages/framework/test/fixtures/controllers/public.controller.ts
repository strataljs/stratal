import { object, string } from 'zod/mini'
import { Controller } from 'stratal/router'
import { Route } from 'stratal/router'
import type { RouterContext } from 'stratal/router'

@Controller('/api/test/public')
export class PublicController {
  @Route({
    summary: 'Public index',
    response: object({ message: string() }),
  })
  index(ctx: RouterContext) {
    return ctx.json({ message: 'public' })
  }

  @Route({
    summary: 'Public show',
    params: object({ id: string() }),
    response: object({ id: string() }),
  })
  show(ctx: RouterContext) {
    const id = ctx.param('id')
    return ctx.json({ id })
  }
}
