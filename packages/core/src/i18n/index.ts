/**
 * I18n Module Public API
 */

export * from './errors'
export * from './i18n.error'
export { I18nModule } from './i18n.module'
export * from './i18n.options'
export { I18N_TOKENS } from './i18n.tokens'
export * from './i18n.types'
export { getLocales, getMessages, messages, type Messages } from './messages'
export { MessageLoaderService } from './services/message-loader.service'
export { MessageRegistry } from './services/message-registry'
export { withI18n } from './with-i18n'

