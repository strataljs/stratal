import { DI_TOKENS, inject } from 'stratal/di'
import { UseGuards } from 'stratal/guards'
import { Controller, type IController, Route, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'
import type { AuthContext } from '@stratal/framework/context'
import { AuthGuard } from '@stratal/framework/guards'

@Controller('/api/profile')
@UseGuards(AuthGuard())
export class ProfileController implements IController {
  constructor(
    @inject(DI_TOKENS.AuthContext) private readonly authContext: AuthContext,
  ) {}

  @Route({
    response: z.object({
      data: z.object({
        userId: z.string(),
        authenticated: z.boolean(),
      }),
    }),
    summary: 'Get current user profile',
  })
  index(ctx: RouterContext) {
    return ctx.json({
      data: {
        userId: this.authContext.requireUserId(),
        authenticated: this.authContext.isAuthenticated(),
      },
    })
  }
}
