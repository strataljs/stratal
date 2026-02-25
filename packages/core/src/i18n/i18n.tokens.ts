/**
 * I18n Module DI Tokens
 * Symbol-based tokens to avoid string collisions
 */

export const I18N_TOKENS = {
  /** MessageLoaderService - loads and caches locale messages */
  MessageLoader: Symbol.for('I18nModule.MessageLoader'),
  /** I18nService - request-scoped translation service */
  I18nService: Symbol.for('I18nModule.I18nService'),
  /** I18nModuleOptions - configuration options from withRoot() */
  Options: Symbol.for('I18nModule.Options')
} as const
