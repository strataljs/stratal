import { Module } from '../module'
import type { AsyncModuleOptions, DynamicModule, ModuleContext, OnInitialize } from '../module/types'
import type { I18nModuleOptions } from './i18n.options'
import { I18N_TOKENS } from './i18n.tokens'
import { I18nService } from './services/i18n.service'
import { MessageLoaderService } from './services/message-loader.service'
import { MessageRegistry } from './services/message-registry'
import { config } from 'zod/mini'
import { zodErrorMap } from './validation/validation.context'

@Module({
  providers: [
    { provide: I18N_TOKENS.MessageRegistry, useClass: MessageRegistry },
    { provide: I18N_TOKENS.MessageLoader, useClass: MessageLoaderService },
    { provide: I18N_TOKENS.I18nService, useClass: I18nService },
  ],
})
export class I18nModule implements OnInitialize {
  onInitialize(_context: ModuleContext): void {
    config({ customError: zodErrorMap })
  }

  static forRoot(options: I18nModuleOptions = {}): DynamicModule {
    return {
      module: I18nModule,
      providers: [
        { provide: I18N_TOKENS.Options, useValue: options },
      ],
    }
  }

  /**
   * Configure i18n with options resolved asynchronously from injected
   * dependencies (e.g. a config service). Useful when `detection` is a per-path
   * resolver built from runtime config.
   */
  static forRootAsync(options: AsyncModuleOptions<I18nModuleOptions>): DynamicModule {
    return {
      module: I18nModule,
      providers: [
        {
          provide: I18N_TOKENS.Options,
          useFactory: options.useFactory,
          inject: options.inject,
        },
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
