import { Transient } from '../../src/di/decorators'
import { I18nModule } from '../../src/i18n/i18n.module'
import { z } from '../../src/i18n/validation'
import { Module } from '../../src/module/module.decorator'
import { Controller } from '../../src/router/decorators/controller.decorator'
import { Post } from '../../src/router/decorators/http-method.decorator'
import type { Middleware, Next } from '../../src/router/middleware.interface'
import { type RouteConfigurable, type Router } from '../../src/router/router'
import type { RouterContext } from '../../src/router/router-context'

/**
 * Minimal Laravel-Precognition-style middleware mirroring
 * `@stratal/inertia`'s `HandlePrecognitiveRequests`. We don't import the
 * real one to avoid a core → inertia dependency in tests.
 */
@Transient()
class TestPrecognitionMiddleware implements Middleware {
  async handle(ctx: RouterContext, next: Next): Promise<void> {
    if (ctx.header('precognition') === 'true') {
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

const onboardBodySchema = z.object({
  name: z.string().min(1),
  email: z.email(),
})

@Controller('/onboard')
export class PrecognitionOnboardController {
  @Post('/', {
    body: onboardBodySchema,
    response: z.object({ ok: z.literal(true) }),
  })
  store(ctx: RouterContext) {
    return ctx.json({ ok: true as const })
  }
}

@Module({
  imports: [
    I18nModule.forRoot({
      defaultLocale: 'en',
      locales: ['en', 'pt'],
      detection: { strategy: 'path' },
    }),
  ],
  providers: [TestPrecognitionMiddleware],
  controllers: [PrecognitionOnboardController],
})
export class PrecognitionAppModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    router.use(TestPrecognitionMiddleware)
  }
}
