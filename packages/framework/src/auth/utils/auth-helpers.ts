import type { BetterAuthOptions } from 'better-auth'
import { isAPIError, mapBetterAuthError } from './better-auth-error-handler'

/**
 * Get shared Better Auth error handler configuration.
 * Use this in Better Auth config's onAPIError option.
 */
export function getErrorHandlerConfig(): BetterAuthOptions['onAPIError'] {
  return {
    throw: false,
    onError: (error) => {
      if (isAPIError(error)) {
        throw mapBetterAuthError(error)
      }
      throw error
    },
  }
}

/**
 * Wrap a Better Auth function in a try/catch block and map errors to ApplicationError.
 */
export const wrapBetterAuth = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    if (isAPIError(error)) {
      throw mapBetterAuthError(error)
    }
    throw error
  }
}
