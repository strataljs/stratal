/**
 * I18n Module
 *
 * Core infrastructure module for internationalization.
 * Provides message translation and locale handling.
 *
 * - `forRoot()` configures locale settings (call once in root module)
 * - `registerMessages()` adds translations (call from any module, as many times as needed)
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     I18nModule.forRoot({ defaultLocale: 'en', locales: ['en', 'fr'] }),
 *     I18nModule.registerMessages(appMessages),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @example Package contributing messages
 * ```typescript
 * @Module({
 *   imports: [
 *     I18nModule.registerMessages(tenancyMessages),
 *   ],
 * })
 * export class TenancyModule {}
 * ```
 */

import { Scope } from '../di'
import type { MiddlewareConfigurable, MiddlewareConsumer } from '../middleware/types'
import { Module } from '../module'
import type { DynamicModule } from '../module/types'
import type { I18nModuleOptions } from './i18n.options'
import { I18N_TOKENS } from './i18n.tokens'
import { I18nContextMiddleware } from './middleware/i18n-context.middleware'
import { I18nService } from './services/i18n.service'
import { MessageLoaderService } from './services/message-loader.service'
import { MessageRegistry } from './services/message-registry'
import { setupI18nCompiler } from './utils/setup'
import { backendErrorMap, z } from './validation'

// Setup i18n JIT compiler once at module load time
setupI18nCompiler()

// Set global Zod error map for i18n support
z.config({ customError: backendErrorMap })

@Module({
  providers: [
    // Singleton: Message registry (accumulates all registerMessages contributions)
    { provide: I18N_TOKENS.MessageRegistry, useClass: MessageRegistry, scope: Scope.Singleton },
    // Singleton: Message loader (loaded once at startup)
    { provide: I18N_TOKENS.MessageLoader, useClass: MessageLoaderService, scope: Scope.Singleton },
    // Request-scoped: I18n service (per request)
    { provide: I18N_TOKENS.I18nService, useClass: I18nService },
  ],
})
export class I18nModule implements MiddlewareConfigurable {
  /**
   * Configure I18n locale settings
   *
   * Call once in the root module. Does not accept messages —
   * use `registerMessages()` to add translations.
   *
   * @param options - Locale configuration (defaultLocale, fallbackLocale, locales)
   */
  static forRoot(options: I18nModuleOptions = {}): DynamicModule {
    return {
      module: I18nModule,
      providers: [
        { provide: I18N_TOKENS.Options, useValue: options },
      ],
    }
  }

  /**
   * Register i18n messages
   *
   * Can be called from any module, as many times as needed.
   * Messages are deep-merged in registration order — later calls override earlier ones at leaf level.
   *
   * @param messages - Messages keyed by locale code
   *
   * @example App-level messages
   * ```typescript
   * I18nModule.registerMessages({
   *   en: { common: { hello: 'Hello' }, errors: { notFound: 'Not found' } },
   *   fr: { common: { hello: 'Bonjour' }, errors: { notFound: 'Introuvable' } },
   * })
   * ```
   *
   * @example Package-level messages
   * ```typescript
   * I18nModule.registerMessages({
   *   en: { tenancy: { tenantNotFound: 'Tenant not found' } },
   * })
   * ```
   */
  static registerMessages(messages: Record<string, Record<string, unknown>>): DynamicModule {
    MessageRegistry.addMessages(messages)
    return {
      module: I18nModule,
      providers: [],
    }
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(I18nContextMiddleware)
      .forRoutes('*')
  }
}
