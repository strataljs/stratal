import type { ClientContract, ClientOptions } from '@zenstackhq/orm'
import type { ConnectionName, DefaultConnectionName, InferConnectionExtensions, InferConnectionSchema } from './types'

/**
 * DatabaseService type
 *
 * Each connection has its own schema and plugin extensions.
 * Plugin extension types are automatically inferred from `StratalDatabase.plugins`.
 *
 * @example
 * ```typescript
 * // Typed to default connection (includes plugin extensions)
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
  ClientOptions<InferConnectionSchema<K>>,
  InferConnectionExtensions<K>['extQueryArgs'],
  InferConnectionExtensions<K>['extClientMembers'],
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- needed when plugins are declared via StratalDatabase augmentation
  InferConnectionExtensions<K>['extResult']
>
