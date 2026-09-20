import { zenstackAdapter } from '@zenstackhq/better-auth'
import type { BetterAuthOptions } from 'better-auth'
import type { DatabaseService } from '../../src/database/database.service'
import { schema, type SchemaType } from '../zenstack/schema'

export function createTestAuthOptions(
  db: DatabaseService,
): BetterAuthOptions {
  return {
    // The schema is named rather than inferred: inferring it walks `DatabaseService`'s
    // intersection against `ClientContract<Schema>`, which instantiates the client-only
    // `computedFields` map over every model and field and exceeds the checker's stack depth.
    database: zenstackAdapter<SchemaType>(db, { provider: 'postgresql' }),
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
