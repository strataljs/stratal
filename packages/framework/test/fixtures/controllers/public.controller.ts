import { z } from 'stratal/validation'
import { Controller } from 'stratal/router'
import { Route } from 'stratal/router'
import type { RouterContext } from 'stratal/router'

@Controller('/api/test/public')
export class PublicController {
  @Route({
    summary: 'Public index',
    response: z.object({ message: z.string() }),
  })
  index(ctx: RouterContext) {
    return ctx.json({ message: 'public' })
  }

  @Route({
    summary: 'Public show',
    params: z.object({ id: z.string() }),
    response: z.object({ id: z.string() }),
  })
  show(ctx: RouterContext) {
    const id = ctx.param('id')
    return ctx.json({ id })
  }
}
