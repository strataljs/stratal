import { Controller, type IController, Route, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'

@Controller('/api/public')
export class PublicController implements IController {
  @Route({
    response: z.object({
      message: z.string(),
    }),
    summary: 'Public endpoint (no auth required)',
  })
  index(ctx: RouterContext) {
    return ctx.json({ message: 'This endpoint is accessible without authentication.' })
  }
}
