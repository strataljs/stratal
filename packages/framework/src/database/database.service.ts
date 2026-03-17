import type { ClientContract, ClientOptions } from '@zenstackhq/orm'
import type { ModelName } from './event-types'
import type { CursorPaginateOptions, CursorPaginateResult, PaginateOptions, PaginateResult } from './plugins/pagination.plugin'
import type { ConnectionName, DefaultConnectionName, InferConnectionSchema } from './types'

/**
 * $resource namespace added by the pagination plugin
 */
export interface ResourceClientExtension {
  $resource: {
    paginate<T = unknown>(
      model: Uncapitalize<ModelName>,
      options?: PaginateOptions,
    ): Promise<PaginateResult<T>>

    cursorPaginate<T = unknown>(
      model: Uncapitalize<ModelName>,
      options?: CursorPaginateOptions,
    ): Promise<CursorPaginateResult<T>>
  }
}

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
> & ResourceClientExtension
