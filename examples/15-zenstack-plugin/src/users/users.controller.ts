import { Controller, type IController, Route, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'
import { InjectDB, type DatabaseService } from '@stratal/framework/database'

import {
  createPostSchema,
  createUserSchema,
  postListSchema,
  postResponseSchema,
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

  @Route({
    path: '/:id/posts',
    params: z.object({ id: z.string() }),
    response: postListSchema,
    summary: 'List posts for a user',
  })
  async posts(ctx: RouterContext) {
    const posts = await this.db.post.findMany({
      where: { userId: ctx.param('id') },
      orderBy: { createdAt: 'desc' },
    })
    return ctx.json({ data: posts })
  }

  @Route({
    path: '/:id/posts',
    method: 'post',
    params: z.object({ id: z.string() }),
    body: createPostSchema,
    response: postResponseSchema,
    summary: 'Create a post for a user',
  })
  async createPost(ctx: RouterContext) {
    const body = await ctx.body<{ title: string; content?: string; published?: boolean }>()
    const post = await this.db.post.create({
      data: {
        ...body,
        userId: ctx.param('id'),
      },
    })
    return ctx.json({ data: post }, 201)
  }
}
