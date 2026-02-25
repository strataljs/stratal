import { AsyncLocalStorage } from 'node:async_hooks'
import type { ErrorMapContext } from './validation.types'
import { createI18nErrorMap } from './validation.error-map'

/**
 * AsyncLocalStorage for storing request-scoped ErrorMapContext
 * Allows error map to access I18nService without passing through function calls
 */
export const errorMapContextStorage = new AsyncLocalStorage<ErrorMapContext>()

/**
 * Gets the current error map context from AsyncLocalStorage
 */
function getErrorMapContext(): ErrorMapContext | undefined {
  return errorMapContextStorage.getStore()
}

/**
 * Backend error map that accesses I18nService from AsyncLocalStorage
 * Must be initialized in router middleware after locale detection
 */
export const backendErrorMap = createI18nErrorMap(getErrorMapContext)

/**
 * Runs a function within an error map context
 * Used by router middleware to provide I18nService to validation
 *
 * @example
 * ```typescript
 * router.use('*', async (c, next) => {
 *   const i18nService = c.get('i18nService')
 *   const locale = c.get('locale')
 *
 *   return runWithErrorMapContext(
 *     {
 *       t: (key, params) => i18nService.t(key, params),
 *       locale,
 *     },
 *     () => next()
 *   )
 * })
 * ```
 */
export function runWithErrorMapContext<T>(
  context: ErrorMapContext,
  fn: () => T
): T {
  return errorMapContextStorage.run(context, fn)
}
