import { createI18nErrorMap } from './validation.error-map'

/**
 * Zod error map that resolves I18nService from the DI container.
 * Falls back to 'Invalid input' when called outside the container scope
 * (e.g., config validation at startup, tests).
 */
export const zodErrorMap = createI18nErrorMap()
