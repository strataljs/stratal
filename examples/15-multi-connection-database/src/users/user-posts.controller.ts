import { Controller, type IController, Route, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'
import { InjectDB, type DatabaseService } from '@stratal/framework/database'

import {
  createPostSchema,
  postListSchema,
  postResponseSchema,
} from './users.schemas'

@Controller('/api/users/:userId/posts')
export class UserPostsController implements IController {
  constructor(
    @InjectDB('main') private readonly db: DatabaseService<'main'>,
  ) {}

  @Route({
    params: z.object({ userId: z.string() }),
    response: postListSchema,
    summary: 'List posts for a user',
  })
  async index(ctx: RouterContext) {
    const posts = await this.db.post.findMany({
      where: { userId: ctx.param('userId') },
      orderBy: { createdAt: 'desc' },
    })
    return ctx.json({ data: posts })
  }

  @Route({
    params: z.object({ userId: z.string() }),
    body: createPostSchema,
    response: postResponseSchema,
    summary: 'Create a post for a user',
  })
  async create(ctx: RouterContext) {
    const body = await ctx.body<{ title: string; content?: string; published?: boolean }>()
    const post = await this.db.post.create({
      data: {
        ...body,
        userId: ctx.param('userId'),
      },
    })
    return ctx.json({ data: post }, 201)
  }
}
