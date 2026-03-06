import { inject } from 'tsyringe'
import { z } from 'stratal/validation'
import { DI_TOKENS } from 'stratal/di'
import { Controller, Route } from 'stratal/router'
import type { RouterContext } from 'stratal/router'
import { UseGuards } from 'stratal/guards'
import { AuthGuard } from '../../../src/guards/auth.guard'
import type { DatabaseService } from '../../../src/database/database.service'
import type { AuthContext } from '../../../src/context/auth-context'
import { InjectDB } from '../../../src/database/decorators/inject-db.decorator'

@Controller('/api/test/posts')
export class PostsController {
  constructor(
    @InjectDB('main') private readonly db: DatabaseService,
    @inject(DI_TOKENS.AuthContext) private readonly authContext: AuthContext
  ) {}

  @Route({
    summary: 'List published posts',
    response: z.array(z.object({
      id: z.string(),
      title: z.string(),
      published: z.boolean(),
    })),
  })
  async index(ctx: RouterContext) {
    const posts = await this.db.post.findMany({
      where: { published: true },
      select: { id: true, title: true, published: true },
    })
    return ctx.json(posts)
  }

  @Route({
    summary: 'Create post',
    body: z.object({
      title: z.string().min(1),
      content: z.string().optional(),
      published: z.boolean().optional(),
    }),
    response: z.object({
      id: z.string(),
      title: z.string(),
      content: z.string().nullable(),
      published: z.boolean(),
      authorId: z.string(),
    }),
  })
  @UseGuards(AuthGuard())
  async create(ctx: RouterContext) {
    const body = await ctx.body<{ title: string; content?: string; published?: boolean }>()
    const userId = this.authContext.requireUserId()
    const post = await this.db.post.create({
      data: {
        title: body.title,
        content: body.content,
        published: body.published ?? false,
        authorId: userId,
      },
    })
    return ctx.json(post, 201)
  }

  @Route({
    summary: 'Show post',
    params: z.object({ id: z.string() }),
    response: z.object({
      id: z.string(),
      title: z.string(),
      content: z.string().nullable(),
      published: z.boolean(),
      authorId: z.string(),
    }),
  })
  async show(ctx: RouterContext) {
    const id = ctx.param('id')
    const post = await this.db.post.findUniqueOrThrow({ where: { id } })
    return ctx.json(post)
  }

  @Route({
    summary: 'Update post',
    params: z.object({ id: z.string() }),
    body: z.object({
      title: z.string().optional(),
      content: z.string().optional(),
      published: z.boolean().optional(),
    }),
    response: z.object({
      id: z.string(),
      title: z.string(),
      content: z.string().nullable(),
      published: z.boolean(),
      authorId: z.string(),
    }),
  })
  @UseGuards(AuthGuard({ scopes: ['posts:update'] }))
  async update(ctx: RouterContext) {
    const id = ctx.param('id')
    const body = await ctx.body<{ title?: string; content?: string; published?: boolean }>()
    const post = await this.db.post.update({
      where: { id },
      data: body,
    })
    return ctx.json(post)
  }

  @Route({
    summary: 'Delete post',
    params: z.object({ id: z.string() }),
    response: z.object({ deleted: z.boolean() }),
  })
  @UseGuards(AuthGuard({ scopes: ['posts:delete'] }))
  async destroy(ctx: RouterContext) {
    const id = ctx.param('id')
    await this.db.post.delete({ where: { id } })
    return ctx.json({ deleted: true })
  }
}
