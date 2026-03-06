import { AUTH_SERVICE, type AuthService } from '@stratal/framework/auth'
import { inject } from 'stratal/di'
import { Controller, type IController, type RouterContext } from 'stratal/router'

@Controller('/api/auth')
export class AuthController implements IController {
  constructor(
    @inject(AUTH_SERVICE) private readonly authService: AuthService,
  ) {}

  async handle(ctx: RouterContext) {
    return this.authService.auth.handler(ctx.c.req.raw)
  }
}
