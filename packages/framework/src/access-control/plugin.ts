import type { BetterAuthPlugin } from 'better-auth'
import type { AccessControlOptions } from './types'

/**
 * Creates the Stratal access control Better Auth plugin.
 *
 * Ensures the `user.role` schema field exists.
 * No endpoints are added — all permission logic lives in AccessService.
 *
 * Auto-added to Better Auth options when `accessControl` is provided to
 * `AuthModule.forRootAsync()`. Users never call this directly.
 */
export function createStratalAcPlugin(_options: AccessControlOptions): BetterAuthPlugin {
  return {
    id: 'stratal-ac',
    schema: {
      user: {
        fields: {
          role: {
            type: 'string',
            required: false,
            input: false,
            defaultValue: 'user',
          },
        },
      },
    },
  }
}
