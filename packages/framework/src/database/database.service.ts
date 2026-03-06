import type { ClientContract, ClientOptions } from '@zenstackhq/orm'
import type { ConnectionName, DefaultConnectionName, InferConnectionSchema } from './types'

/**
 * DatabaseService type
 *
 * Provides strict typing per connection name via `DatabaseSchemaRegistry` augmentation.
 *
 * @example
 * ```typescript
 * // Typed to default connection schema
 * constructor(@inject(DI_TOKENS.Database) private db: DatabaseService) {}
 *
 * // Typed to a specific named connection schema
 * constructor(@InjectDB('analytics') private analytics: DatabaseService<'analytics'>) {}
 * ```
 */
export type DatabaseService<
  K extends ConnectionName = DefaultConnectionName,
  Schema extends InferConnectionSchema<K> = InferConnectionSchema<K>,
> = ClientContract<Schema, ClientOptions<Schema>>
