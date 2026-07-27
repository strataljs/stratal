import { I18nModule } from '../../src/i18n/i18n.module'
import { cuid2 as cuid2Builtin, object } from 'zod/mini'
import { cuid2 } from '../../src/i18n/validation'
import { Module } from '../../src/module/module.decorator'
import { Controller } from '../../src/router/decorators/controller.decorator'
import { Get } from '../../src/router/decorators/http-method.decorator'
import type { RouterContext } from '../../src/router/router-context'
import { type RouteConfigurable, type Router } from '../../src/router/router'

@Controller('/settings', { name: 'settings.' })
export class LocalePrefixSettingsController {
  @Get('/', { name: 'profile' })
  profile(ctx: RouterContext) {
    return ctx.json({
      tenantId: ctx.param('tenantId'),
    })
  }
}

/**
 * Mirrors the consumer app's setup: prefix uses `z.cuid2()`, with locale-path
 * detection enabled. Demonstrates a Zod 4.3.6 gotcha — `cuid2()` regex is
 * `/^[0-9a-z]+$/`, which accepts any non-empty lowercase-alphanumeric string
 * (including `'sw'`).
 */
@Module({
  imports: [
    I18nModule.forRoot({
      defaultLocale: 'en',
      locales: ['en', 'sw'],
      detection: { strategy: 'path' },
    }),
  ],
  controllers: [LocalePrefixSettingsController],
})
export class LocalePrefixAppModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    router
      .prefix('/:tenantId', object({ tenantId: cuid2Builtin() }))
  }
}

/**
 * Same shape as {@link LocalePrefixAppModule}, but uses Stratal's `cuid2()`
 * helper from `stratal/validation`, which layers a proper shape regex on top
 * of `z.cuid2()`. Pins both behaviours:
 *   1. The helper actually rejects non-cuid2 values like `'sw'`.
 *   2. The prototype-mutation regression — when both modules register the
 *      same controller class in the same test run, this module's strict
 *      schema must not be replaced by a stale schema cached on the
 *      controller's metadata by an earlier registration.
 */
@Module({
  imports: [
    I18nModule.forRoot({
      defaultLocale: 'en',
      locales: ['en', 'sw'],
      detection: { strategy: 'path' },
    }),
  ],
  controllers: [LocalePrefixSettingsController],
})
export class LocalePrefixStrictAppModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    router
      .prefix('/:tenantId', object({ tenantId: cuid2() }))
  }
}
