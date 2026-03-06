import { Controller, type IController, Route, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'

import { StatsListener } from './stats.listener'

const statsSchema = z.object({
  data: z.object({
    notify: z.number(),
    index: z.number(),
    webhook: z.number(),
  }),
})

@Controller('/api/stats')
export class StatsController implements IController {
  @Route({
    response: statsSchema,
    summary: 'Get event stats',
  })
  index(ctx: RouterContext) {
    return ctx.json({ data: StatsListener.counts })
  }
}
