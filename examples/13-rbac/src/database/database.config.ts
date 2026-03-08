import type { DatabaseModuleConfig } from '@stratal/framework/database'
import { PostgresDialect } from '@zenstackhq/orm/dialects/postgres'
import { Pool } from 'pg'
import type { StratalEnv } from 'stratal'

import { schema } from '../../db/zenstack/schema'

export function createDatabaseConfig(env: StratalEnv): DatabaseModuleConfig {
  return {
    schema,
    default: 'main',
    connections: [
      {
        name: 'main',
        dialect: () => new PostgresDialect({
          pool: new Pool({
            connectionString: env.DB.connectionString,
            max: 1,
          }),
        }),
      },
    ],
  }
}
