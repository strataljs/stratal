import { I18nModule } from '../../src/i18n/i18n.module'
import { Module } from '../../src/module/module.decorator'
import { frenchMessages } from './i18n-messages'
import { BenchController, BenchItemsController } from './bench.controller'

@Module({
  imports: [
    I18nModule.forRoot({
      defaultLocale: 'en',
      locales: ['en', 'fr'],
      messages: { fr: frenchMessages },
    }),
  ],
  controllers: [BenchController, BenchItemsController],
})
export class I18nAppModule {}
