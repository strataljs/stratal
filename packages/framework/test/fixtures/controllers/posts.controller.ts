import { array, boolean, minLength, nullable, object, optional, string } from 'zod/mini'
import { inject } from 'stratal/di'
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
    response: array(object({
      id: string(),
      title: string(),
      published: boolean(),
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
    body: object({
      title: string().check(minLength(1)),
      content: optional(string()),
      published: optional(boolean()),
    }),
    response: object({
      id: string(),
      title: string(),
      content: nullable(string()),
      published: boolean(),
      authorId: string(),
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
    params: object({ id: string() }),
    response: object({
      id: string(),
      title: string(),
      content: nullable(string()),
      published: boolean(),
      authorId: string(),
    }),
  })
  async show(ctx: RouterContext) {
    const id = ctx.param('id')
    const post = await this.db.post.findUniqueOrThrow({ where: { id } })
    return ctx.json(post)
  }

  @Route({
    summary: 'Update post',
    params: object({ id: string() }),
    body: object({
      title: optional(string()),
      content: optional(string()),
      published: optional(boolean()),
    }),
    response: object({
      id: string(),
      title: string(),
      content: nullable(string()),
      published: boolean(),
      authorId: string(),
    }),
  })
  @UseGuards(AuthGuard({ permissions: 'posts:update' }))
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
    params: object({ id: string() }),
    response: object({ deleted: boolean() }),
  })
  @UseGuards(AuthGuard({ permissions: 'posts:delete' }))
  async destroy(ctx: RouterContext) {
    const id = ctx.param('id')
    await this.db.post.delete({ where: { id } })
    return ctx.json({ deleted: true })
  }
}
