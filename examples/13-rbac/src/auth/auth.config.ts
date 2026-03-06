import type { DatabaseService } from '@stratal/framework/database'
import { zenstackAdapter } from '@zenstackhq/better-auth'
import type { BetterAuthOptions } from 'better-auth'
import type { StratalEnv } from 'stratal'

export function createAuthOptions(env: StratalEnv, db: DatabaseService): BetterAuthOptions {
  return {
    secret: env.BETTER_AUTH_SECRET,
    database: zenstackAdapter(db, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
    },
  }
}
