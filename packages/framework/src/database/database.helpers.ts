import { ZenStackClient, type AnyPlugin } from '@zenstackhq/orm'
import type { IEventRegistry } from 'stratal/events'
import { z } from 'stratal/validation'
import type { DatabaseConnectionConfig } from './database.module'
import { ErrorHandlerPlugin, EventEmitterPlugin } from './plugins'

const databaseConnectionSchema = z.object({
  name: z.string().min(1, 'Connection name is required'),
  schema: z.object({}).loose(),
  dialect: z.object({}).loose(),
  plugins: z.array(z.object({}).loose()).optional(),
})

export const databaseModuleConfigSchema = z.object({
  default: z.string().min(1, 'Default connection name is required'),
  connections: z.array(databaseConnectionSchema).min(1, 'At least one connection is required'),
}).refine(
  (config) => {
    const names = config.connections.map(c => c.name)
    return new Set(names).size === names.length
  },
  { message: 'Duplicate connection names found' }
).refine(
  (config) => config.connections.some(c => c.name === config.default),
  { message: 'Default connection not found in connections' }
)

export function createDatabaseService(
  conn: DatabaseConnectionConfig,
  eventRegistry: IEventRegistry,
) {
  const plugins: AnyPlugin[] = [
    new ErrorHandlerPlugin(),
    new EventEmitterPlugin({
      eventRegistry,
    }),
    ...(conn.plugins ?? []),
  ]
  return new ZenStackClient(conn.schema, { dialect: conn.dialect, plugins })
}
