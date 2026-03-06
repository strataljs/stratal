import { z } from 'stratal/validation'
import { Controller, Route } from 'stratal/router'
import type { RouterContext } from 'stratal/router'
import { UseGuards } from 'stratal/guards'
import { AuthGuard } from '../../../src/guards/auth.guard'
import type { DatabaseService } from '../../../src/database/database.service'
import { InjectDB } from '../../../src/database/decorators/inject-db.decorator'

@Controller('/api/test/users')
@UseGuards(AuthGuard())
export class UsersController {
  constructor(
    @InjectDB('main') private readonly db: DatabaseService
  ) {}

  @Route({
    summary: 'List users',
    response: z.array(z.object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
      role: z.string(),
    })),
  })
  async index(ctx: RouterContext) {
    const users = await this.db.user.findMany({
      select: { id: true, email: true, name: true, role: true },
    })
    return ctx.json(users)
  }

  @Route({
    summary: 'Show user',
    params: z.object({ id: z.string() }),
    response: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
      role: z.string(),
    }),
  })
  async show(ctx: RouterContext) {
    const id = ctx.param('id')
    const user = await this.db.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, email: true, name: true, role: true },
    })
    return ctx.json(user)
  }
}
