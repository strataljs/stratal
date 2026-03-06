import { kyselyAdapter } from '@better-auth/kysely-adapter';
import type { BetterAuthOptions } from 'better-auth';
import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import type { StratalEnv } from 'stratal';

export function createAuthOptions(env: StratalEnv): BetterAuthOptions {
  return {
    secret: env.BETTER_AUTH_SECRET,
    database: kyselyAdapter(new Kysely({
      dialect: new D1Dialect({ database: env.DB })
    })),
    emailAndPassword: {
      enabled: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
    },
  }
}
