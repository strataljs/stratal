import { Controller, type IController, Route, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'
import { InjectDB, type DatabaseService } from '@stratal/framework/database'

import {
  createUserSchema,
  updateUserSchema,
  userListSchema,
  userResponseSchema,
} from './users.schemas'

@Controller('/api/users')
export class UsersController implements IController {
  constructor(
    @InjectDB('main') private readonly db: DatabaseService<'main'>,
  ) {}

  @Route({
    response: userListSchema,
    summary: 'List all users',
  })
  async index(ctx: RouterContext) {
    const users = await this.db.user.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return ctx.json({ data: users })
  }

  @Route({
    params: z.object({ id: z.string() }),
    response: userResponseSchema,
    summary: 'Get a user by ID',
  })
  async show(ctx: RouterContext) {
    const user = await this.db.user.findUnique({
      where: { id: ctx.param('id') },
    })
    if (!user) return ctx.json({ error: 'User not found' }, 404)
    return ctx.json({ data: user })
  }

  @Route({
    body: createUserSchema,
    response: userResponseSchema,
    summary: 'Create a new user',
  })
  async create(ctx: RouterContext) {
    const body = await ctx.body<{ email: string; name: string }>()
    const user = await this.db.user.create({ data: body })
    return ctx.json({ data: user }, 201)
  }

  @Route({
    params: z.object({ id: z.string() }),
    body: updateUserSchema,
    response: userResponseSchema,
    summary: 'Update a user',
  })
  async update(ctx: RouterContext) {
    const body = await ctx.body<{ email?: string; name?: string }>()
    const user = await this.db.user.update({
      where: { id: ctx.param('id') },
      data: body,
    })
    return ctx.json({ data: user })
  }

  @Route({
    params: z.object({ id: z.string() }),
    response: z.object({ success: z.boolean() }),
    summary: 'Delete a user',
  })
  async destroy(ctx: RouterContext) {
    await this.db.user.delete({
      where: { id: ctx.param('id') },
    })
    return ctx.json({ success: true })
  }

}
