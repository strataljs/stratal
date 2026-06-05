import { Module } from '../module'
import type { DynamicModule, ModuleContext, OnInitialize } from '../module/types'
import type { I18nModuleOptions } from './i18n.options'
import { I18N_TOKENS } from './i18n.tokens'
import { I18nService } from './services/i18n.service'
import { MessageLoaderService } from './services/message-loader.service'
import { MessageRegistry } from './services/message-registry'
import { zodErrorMap } from './validation/validation.context'
import { z } from './validation/zod'

@Module({
  providers: [
    { provide: I18N_TOKENS.MessageRegistry, useClass: MessageRegistry },
    { provide: I18N_TOKENS.MessageLoader, useClass: MessageLoaderService },
    { provide: I18N_TOKENS.I18nService, useClass: I18nService },
  ],
})
export class I18nModule implements OnInitialize {
  onInitialize(_context: ModuleContext): void {
    z.config({ customError: zodErrorMap })
  }

  static forRoot(options: I18nModuleOptions = {}): DynamicModule {
    return {
      module: I18nModule,
      providers: [
        { provide: I18N_TOKENS.Options, useValue: options },
      ],
    }
  }

  static registerMessages(messages: Record<string, Record<string, unknown>>): DynamicModule {
    MessageRegistry.addMessages(messages)
    return {
      module: I18nModule,
      providers: [],
    }
  }
}
