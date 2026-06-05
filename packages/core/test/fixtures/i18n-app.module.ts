import type { ExceptionHandler } from '../../src/errors';
import { type HttpException } from '../../src/errors/http-exception';
import { I18nModule } from '../../src/i18n/i18n.module';
import { I18N_TOKENS } from '../../src/i18n/i18n.tokens';
import type { II18nService, MessageKeys } from '../../src/i18n/i18n.types';
import { Module } from '../../src/module/module.decorator';
import type { OnException } from '../../src/module/types';
import { BenchController, BenchItemsController } from './bench.controller';
import { frenchMessages } from './i18n-messages';
 
@Module({
  imports: [
    I18nModule.forRoot({
      defaultLocale: 'en',
      locales: ['en', 'fr'],
      detection: { strategy: 'header' },
    }),
    I18nModule.registerMessages({ fr: frenchMessages }),
  ],
  controllers: [BenchController, BenchItemsController],
})
export class I18nAppModule implements OnException {
  onException(handler: ExceptionHandler): void {
    handler.respond((response, error, context) => {
      if (context.type !== 'http') return response

      const i18nKeys: Record<string, string> = {
        RouteNotFoundError: 'errors.routeNotFound',
        SchemaValidationError: 'errors.schemaValidation',
      }
      const i18nKey = i18nKeys[error.name]
      if (!i18nKey) return response

      const i18n = context.ctx.getContainer().resolve<II18nService>(I18N_TOKENS.I18nService)
      // Pass error properties as i18n interpolation params
      const params: Record<string, unknown> = {}
      for (const key of Object.getOwnPropertyNames(error)) {
        if (key !== 'stack' && key !== 'timestamp' && key !== 'name') {
          params[key] = (error as unknown as Record<string, unknown>)[key]
        }
      }
      const translated = i18n.t(i18nKey as MessageKeys, params as Record<string, string | number>)
      if (translated === i18nKey) return response

      const httpError = error as unknown as HttpException
      const status = typeof httpError.httpStatus === 'number' ? httpError.httpStatus : 500

      return Response.json(
        { message: translated, timestamp: error.timestamp },
        { status },
      )
    })
  }
}
