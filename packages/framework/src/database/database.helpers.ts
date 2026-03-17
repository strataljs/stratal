import { ZenStackClient, type AnyPlugin } from '@zenstackhq/orm'
import { Transient } from 'stratal/di'
import type { IEventRegistry } from 'stratal/events'
import { withI18n, z } from 'stratal/validation'
import type { DatabaseConnectionConfig } from './database.module'
import { ErrorHandlerPlugin, EventEmitterPlugin, paginationPlugin } from './plugins'

const databaseConnectionSchema = z.object({
  name: z.string().min(1, withI18n('database.connectionNameRequired')),
  schema: z.object({}).loose(),
  dialect: z.function(),
  plugins: z.array(z.object({}).loose()).optional(),
})

export const databaseModuleConfigSchema = z.object({
  default: z.string().min(1, withI18n('database.defaultConnectionRequired')),
  connections: z.array(databaseConnectionSchema).min(1, withI18n('database.connectionRequired')),
}).refine(
  (config) => {
    const names = config.connections.map(c => c.name)
    return new Set(names).size === names.length
  },
  withI18n('database.duplicateConnections')
).refine(
  (config) => config.connections.some(c => c.name === config.default),
  withI18n('database.defaultConnectionNotFound')
)

export function createDatabaseService(
  conn: DatabaseConnectionConfig,
  eventRegistry: IEventRegistry,
): new () => InstanceType<typeof ZenStackClient> {
  const plugins: AnyPlugin[] = [
    new ErrorHandlerPlugin(),
    new EventEmitterPlugin({
      eventRegistry,
    }),
    paginationPlugin,
    ...(conn.plugins ?? []),
  ]

  @Transient()
  class DatabaseClient extends ZenStackClient<typeof conn.schema> {
    constructor() {
      const dialect = conn.dialect()
      super(conn.schema, { dialect, plugins })
    }
  }

  return DatabaseClient
}
