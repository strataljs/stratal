/**
 * I18n Module DI Tokens
 * Symbol-based tokens to avoid string collisions
 */

export const I18N_TOKENS = {
  /** MessageLoaderService - loads and caches locale messages */
  MessageLoader: Symbol.for('stratal:i18n:message:loader'),
  /** I18nService - request-scoped translation service */
  I18nService: Symbol.for('stratal:i18n:service'),
  /** I18nModuleOptions - configuration options from forRoot() */
  Options: Symbol.for('stratal:i18n:options'),
  /** MessageRegistry - singleton accumulator for registerMessages() contributions */
  MessageRegistry: Symbol.for('stratal:i18n:message:registry'),
} as const
