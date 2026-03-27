import { Transient } from 'stratal/di'
import type { Middleware, RouterContext } from 'stratal/router'

@Transient()
export class HandlePrecognitiveRequests implements Middleware {
  async handle(ctx: RouterContext, next: () => Promise<void>): Promise<void> {
    const isPrecognition = ctx.header('precognition') === 'true'
    ctx.c.set('precognition', isPrecognition)

    if (isPrecognition) {
      ctx.c.set('validationSuccessResponse', new Response(null, {
        status: 204,
        headers: {
          'Precognition': 'true',
          'Precognition-Success': 'true',
          'Vary': 'Precognition',
        },
      }))
    }

    await next()
  }
}
