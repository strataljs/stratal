import type { ClientContract, ClientOptions, TransactionClientContract, TransactionIsolationLevel } from '@zenstackhq/orm'
import type { CursorClientMembers } from './pagination/cursor-reader'
import type { ConnectionName, DefaultConnectionName, InferConnectionExtensions, InferConnectionSchema } from './types'

/**
 * Client members every connection carries, because `createDatabaseService`
 * defines them on every client it builds — the base client and the transaction
 * client alike.
 *
 * Intersected onto the client from outside rather than passed as its
 * `ExtClientMembers` argument: that slot is constrained to
 * `Record<string, unknown>`, and the index signature it forces survives
 * `$transaction`'s `Omit` and collapses every model delegate on a transaction
 * client to `unknown`.
 */
type BuiltInClientMembers<K extends ConnectionName> = CursorClientMembers<InferConnectionSchema<K>>

/** The ZenStack client for a connection, before the built-in members are added. */
type ConnectionClient<K extends ConnectionName> = ClientContract<
  InferConnectionSchema<K>,
  ClientOptions<InferConnectionSchema<K>>,
  InferConnectionExtensions<K>['extQueryArgs'],
  InferConnectionExtensions<K>['extClientMembers'],
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- needed when plugins are declared via StratalDatabase augmentation
  InferConnectionExtensions<K>['extResult']
>

/** The client a `$transaction` callback receives, carrying the same built-in members. */
export type TransactionService<K extends ConnectionName = DefaultConnectionName> = TransactionClientContract<
  InferConnectionSchema<K>,
  ClientOptions<InferConnectionSchema<K>>,
  InferConnectionExtensions<K>['extQueryArgs'],
  InferConnectionExtensions<K>['extClientMembers'],
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- needed when plugins are declared via StratalDatabase augmentation
  InferConnectionExtensions<K>['extResult']
> & BuiltInClientMembers<K>

/** `{ [I]: Awaited<P[I]> }`, matching what the sequential form of `$transaction` resolves to. */
type UnwrapPromises<P extends readonly unknown[]> = { [I in keyof P]: Awaited<P[I]> }

/**
 * `$transaction`, restated so the interactive form hands back a client carrying
 * the built-in members. ZenStack types its callback with its own
 * `TransactionClientContract`, which knows nothing of them.
 *
 * Intersected ahead of the client rather than replacing its `$transaction`,
 * because overload resolution across an intersection tries the constituents in
 * order and these have to be reached first. `Omit`ing the original is not the
 * alternative it looks like: with an unresolved `SchemaDef` the client's model
 * delegates are an index signature, so `keyof` is `string`, `Omit` collapses
 * every named member into it, and `$queryRawUnsafe` starts resolving to a model
 * delegate.
 *
 * The sequential form is restated unchanged — it is only here because an
 * overload set has to be declared together.
 */
interface TransactionWithBuiltIns<K extends ConnectionName> {
  $transaction<T>(
    callback: (tx: TransactionService<K>) => Promise<T>,
    options?: { isolationLevel?: TransactionIsolationLevel },
  ): Promise<T>
  $transaction<P extends readonly PromiseLike<unknown>[]>(
    arg: [...P],
    options?: { isolationLevel?: TransactionIsolationLevel },
  ): Promise<UnwrapPromises<P>>
}

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
> =
  & TransactionWithBuiltIns<K>
  & ConnectionClient<K>
  & BuiltInClientMembers<K>
