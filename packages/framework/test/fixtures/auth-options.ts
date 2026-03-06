import { zenstackAdapter } from '@zenstackhq/better-auth'
import type { BetterAuthOptions } from 'better-auth'
import type { DatabaseService } from '../../src/database/database.service'
import { schema } from '../../zenstack/schema'

export function createTestAuthOptions(
  db: DatabaseService,
): BetterAuthOptions {
  return {
    database: zenstackAdapter(db, { provider: 'postgresql' }),
    secret: 'test-secret-key-for-deterministic-sessions',
    baseURL: 'http://localhost',
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    trustedOrigins: ['http://localhost'],
  }
}

export { schema }
