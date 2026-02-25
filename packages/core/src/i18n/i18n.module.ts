/**
 * I18n Module
 *
 * Core infrastructure module for internationalization.
 * Provides message translation and locale handling.
 *
 * @example Default usage (system messages only)
 * ```typescript
 * // In Application.ts - I18nModule is already included in core modules
 * // Works with system messages and 'en' default locale
 * ```
 *
 * @example With app-specific configuration
 * ```typescript
 * // In apps/backend/src/app.module.ts
 * import { i18nConfig } from './i18n'
 *
 * @Module({
 *   imports: [I18nModule.withRoot(i18nConfig)],
 * })
 * export class AppModule {}
 * ```
 */

import { backendErrorMap, z } from './validation'
import { Scope } from '../di'
import type { MiddlewareConfigurable, MiddlewareConsumer } from '../middleware/types'
import { Module } from '../module'
import type { DynamicModule } from '../module/types'
import type { I18nModuleOptions } from './i18n.options'
import { I18N_TOKENS } from './i18n.tokens'
import { I18nContextMiddleware } from './middleware/i18n-context.middleware'
import { LocaleExtractionMiddleware } from './middleware/locale-extraction.middleware'
import { I18nService } from './services/i18n.service'
import { MessageLoaderService } from './services/message-loader.service'
import { setupI18nCompiler } from './setup'

// Setup i18n JIT compiler once at module load time
// This registers the message compiler globally for all I18nService instances
// Must be called before any Application initialization
setupI18nCompiler()

// Set global Zod error map for i18n support using v4 config API
// This registers the custom error map that translates validation errors
// Must be set once at module load time, before any schema validation
z.config({ customError: backendErrorMap })


@Module({
  providers: [
    // Singleton: Message loader (loaded once at startup, via Scope.Singleton)
    { provide: I18N_TOKENS.MessageLoader, useClass: MessageLoaderService, scope: Scope.Singleton },
    // Request-scoped: I18n service (per request via Scope.Request)
    { provide: I18N_TOKENS.I18nService, useClass: I18nService },
  ],
})
export class I18nModule implements MiddlewareConfigurable {
  /**
   * Configure I18n with app-specific options
   *
   * Use this method in AppModule to provide custom locale configuration
   * and app-specific messages that merge with system messages.
   *
   * @param options - I18n configuration options
   * @returns Dynamic module with options provider
   *
   * @example
   * ```typescript
   * // apps/backend/src/i18n/index.ts
   * export const i18nConfig: I18nModuleOptions = {
   *   defaultLocale: 'en',
   *   fallbackLocale: 'en',
   *   locales: ['en', 'fr'],
   *   messages: appMessages
   * }
   *
   * // apps/backend/src/app.module.ts
   * @Module({
   *   imports: [I18nModule.withRoot(i18nConfig)],
   * })
   * export class AppModule {}
   * ```
   */
  static withRoot(options: I18nModuleOptions = {}): DynamicModule {
    return {
      module: I18nModule,
      providers: [
        { provide: I18N_TOKENS.Options, useValue: options },
      ],
    }
  }

  /**
   * Configure middleware for locale extraction and i18n context
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(LocaleExtractionMiddleware, I18nContextMiddleware)
      .forRoutes('*')
  }
}
