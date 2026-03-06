import { z } from 'stratal/validation'
import { Controller, Route } from 'stratal/router'
import type { RouterContext } from 'stratal/router'
import { UseGuards } from 'stratal/guards'
import { AuthGuard } from '../../../src/guards/auth.guard'

@Controller('/api/test/admin')
@UseGuards(AuthGuard({ scopes: ['admin:dashboard'] }))
export class AdminController {
  @Route({
    summary: 'Admin dashboard',
    response: z.object({ access: z.string() }),
  })
  index(ctx: RouterContext) {
    return ctx.json({ access: 'admin' })
  }
}
