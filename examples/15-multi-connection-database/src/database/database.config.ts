import type { DatabaseModuleConfig } from '@stratal/framework/database'
import { PostgresDialect } from '@zenstackhq/orm/dialects/postgres'
import { Pool } from 'pg'
import type { StratalEnv } from 'stratal'

import { schema as mainSchema } from '../../db/main/schema'
import { schema as analyticsSchema } from '../../db/analytics/schema'

export function createDatabaseConfig(env: StratalEnv): DatabaseModuleConfig {
  return {
    default: 'main',
    connections: [
      {
        name: 'main',
        schema: mainSchema,
        dialect: () => new PostgresDialect({
          pool: new Pool({
            connectionString: env.DB_MAIN.connectionString,
            max: 1,
          }),
        }),
      },
      {
        name: 'analytics',
        schema: analyticsSchema,
        dialect: () => new PostgresDialect({
          pool: new Pool({
            connectionString: env.DB_ANALYTICS.connectionString,
            max: 1,
          }),
        }),
      },
    ],
  }
}
