import { I18nModule } from '../../src/i18n/i18n.module'
import { minLength, object, string } from 'zod/mini'
import { Module } from '../../src/module/module.decorator'
import { Controller } from '../../src/router/decorators/controller.decorator'
import { Get } from '../../src/router/decorators/http-method.decorator'
import type { RouterContext } from '../../src/router/router-context'

const slugParamsSchema = object({ slug: string().check(minLength(1)) })

/**
 * Mirrors the catch-all "any-slug" page handler used by the admissions
 * applicant portal — the route shape that originally surfaced this bug.
 */
@Controller('/', { name: 'pages.' })
export class LocalePrefixCatchallController {
  @Get('/:slug{.+}', { name: 'show', params: slugParamsSchema })
  show(ctx: RouterContext) {
    return ctx.json({
      slug: ctx.param('slug'),
      locale: ctx.getLocale(),
    })
  }
}

@Module({
  imports: [
    I18nModule.forRoot({
      defaultLocale: 'en',
      locales: ['en', 'sw'],
      detection: { strategy: 'path' },
    }),
  ],
  controllers: [LocalePrefixCatchallController],
})
export class LocalePrefixCatchallAppModule {}
