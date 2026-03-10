import type { ClientContract, ClientOptions } from '@zenstackhq/orm'
import type { ConnectionName, DefaultConnectionName, InferConnectionSchema } from './types'

/**
 * DatabaseService type
 *
 * Each connection has its own schema. The service is typed to the connection's schema.
 *
 * @example
 * ```typescript
 * // Typed to default connection
 * constructor(@inject(DI_TOKENS.Database) private db: DatabaseService) {}
 *
 * // Typed to a specific named connection
 * constructor(@InjectDB('analytics') private analytics: DatabaseService<'analytics'>) {}
 * ```
 */
export type DatabaseService<
  K extends ConnectionName = DefaultConnectionName,
> = ClientContract<
  InferConnectionSchema<K>,
  ClientOptions<InferConnectionSchema<K>>
>
