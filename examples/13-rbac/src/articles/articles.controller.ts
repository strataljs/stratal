import { DI_TOKENS, inject } from 'stratal/di'
import { UseGuards } from 'stratal/guards'
import { Controller, type IController, Route, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'
import type { AuthContext } from '@stratal/framework/context'
import { AuthGuard } from '@stratal/framework/guards'

@Controller('/api/articles')
export class ArticlesController implements IController {
  constructor(
    @inject(DI_TOKENS.AuthContext) private readonly authContext: AuthContext,
  ) {}

  // Anyone with articles:read permission can list articles
  @UseGuards(AuthGuard({ scopes: ['articles:read'] }))
  @Route({
    response: z.object({
      data: z.array(z.object({
        id: z.string(),
        title: z.string(),
        author: z.string(),
      })),
    }),
    summary: 'List articles (requires articles:read)',
  })
  index(ctx: RouterContext) {
    return ctx.json({
      data: [
        { id: '1', title: 'Getting Started with Stratal', author: 'Admin' },
        { id: '2', title: 'RBAC Best Practices', author: 'Editor' },
      ],
    })
  }

  // Only users with articles:write permission can create articles
  @UseGuards(AuthGuard({ scopes: ['articles:write'] }))
  @Route({
    body: z.object({
      title: z.string().min(1),
      content: z.string().min(1),
    }),
    response: z.object({
      data: z.object({
        id: z.string(),
        title: z.string(),
        authorId: z.string(),
      }),
    }),
    summary: 'Create an article (requires articles:write)',
  })
  async create(ctx: RouterContext) {
    const body = await ctx.body<{ title: string; content: string }>()
    return ctx.json({
      data: {
        id: crypto.randomUUID(),
        title: body.title,
        authorId: this.authContext.requireUserId(),
      },
    }, 201)
  }
}
