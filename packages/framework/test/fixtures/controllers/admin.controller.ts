import { object, string } from 'zod/mini'
import { Controller, Route } from 'stratal/router'
import type { RouterContext } from 'stratal/router'
import { UseGuards } from 'stratal/guards'
import { AuthGuard } from '../../../src/guards/auth.guard'

@Controller('/api/test/admin')
@UseGuards(AuthGuard({ permissions: 'admin:access' }))
export class AdminController {
  @Route({
    summary: 'Admin dashboard',
    response: object({ access: string() }),
  })
  index(ctx: RouterContext) {
    return ctx.json({ access: 'admin' })
  }
}
