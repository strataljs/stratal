import { Controller, type IController, type RouterContext } from 'stratal/router'

@Controller('/')
export class HomeController implements IController {
  async index(ctx: RouterContext) {
    return ctx.inertia('Home', {
      message: 'Hello from Stratal!',
    })
  }
}
