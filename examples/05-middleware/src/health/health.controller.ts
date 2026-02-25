import { Controller, IController, Route, RouterContext } from 'stratal'
import { z } from 'stratal/validation'

@Controller('/api/health')
export class HealthController implements IController {
  @Route({
    response: z.object({ status: z.string() }),
  })
  index(ctx: RouterContext) {
    return ctx.json({ status: 'ok' })
  }
}
