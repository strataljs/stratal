/**
 * System Common Messages - English
 *
 * Common messages used by packages/modules infrastructure.
 * These are automatically merged with application-specific messages.
 */

export const common = {
  api: {
    title: 'Stratal API',
    description: 'Platform API',
    serverDescription: 'API server',
    security: {
      bearerAuth: 'JWT Bearer token authentication',
      apiKey: 'API key for service authentication',
      sessionCookie: 'Session cookie for browser authentication'
    }
  }
} as const
