import { Controller, IController, Route, RouterContext } from 'stratal'
import { z } from 'stratal/validation'

@Controller('/api/hello')
export class HelloController implements IController {
  @Route({
    response: z.object({ message: z.string() }),
  })
  index(ctx: RouterContext) {
    return ctx.json({ message: 'Hello World' })
  }
}
