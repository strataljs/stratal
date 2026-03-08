import type { ClientContract, ClientOptions } from '@zenstackhq/orm'
import type { ConnectionName, DefaultConnectionName, InferConnectionSlicing, InferDatabaseSchema } from './types'

/**
 * DatabaseService type
 *
 * All connections share a single schema. Slicing narrows the available models per connection.
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
  InferDatabaseSchema,
  ClientOptions<InferDatabaseSchema> & { slicing: InferConnectionSlicing<K> }
>
