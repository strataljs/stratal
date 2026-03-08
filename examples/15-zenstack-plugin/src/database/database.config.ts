import type { DatabaseModuleConfig } from '@stratal/framework/database'
import { PostgresDialect } from '@zenstackhq/orm/dialects/postgres'
import { Pool } from 'pg'
import type { StratalEnv } from 'stratal'

import { schema } from '../../db/zenstack/schema'
import { connectionSlicing } from '../../db/zenstack/slicing'

export function createDatabaseConfig(env: StratalEnv): DatabaseModuleConfig {
  return {
    schema,
    default: 'main',
    connections: [
      {
        name: 'main',
        slicing: connectionSlicing.main,
        dialect: () => new PostgresDialect({
          pool: new Pool({
            connectionString: env.DB_MAIN.connectionString,
            max: 1,
          }),
        }),
      },
      {
        name: 'analytics',
        slicing: connectionSlicing.analytics,
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
