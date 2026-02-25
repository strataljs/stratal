import { Controller, IController, Route, RouterContext, UseGuards } from 'stratal'
import { z } from 'stratal/validation'
import { ApiKeyGuard } from '../auth/api-key.guard'

@Controller('/api/articles')
@UseGuards(ApiKeyGuard)
export class ArticlesController implements IController {
  @Route({
    response: z.object({
      data: z.array(z.object({
        id: z.string(),
        title: z.string(),
      })),
    }),
    summary: 'List articles (protected)',
  })
  index(ctx: RouterContext) {
    return ctx.json({
      data: [
        { id: '1', title: 'Getting Started with Stratal' },
        { id: '2', title: 'Building APIs with Guards' },
      ],
    })
  }

  @Route({
    params: z.object({ id: z.string() }),
    response: z.object({
      data: z.object({
        id: z.string(),
        title: z.string(),
        content: z.string(),
      }),
    }),
    summary: 'Get article by ID (protected)',
  })
  show(ctx: RouterContext) {
    return ctx.json({
      data: {
        id: ctx.param('id'),
        title: 'Getting Started with Stratal',
        content: 'This is a protected article.',
      },
    })
  }
}
