import { ZenStackClient, type AnyPlugin } from '@zenstackhq/orm';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Transient } from 'stratal/di';
import type { IEventRegistry } from 'stratal/events';
import { withZodI18n, z } from 'stratal/validation';
import type { DatabaseConnectionConfig } from './database.module';
import { ErrorHandlerPlugin, EventEmitterPlugin } from './plugins';

const databaseConnectionSchema = z.object({
  name: z.string().min(1, withZodI18n('database.connectionNameRequired')),
  schema: z.object({}).loose(),
  dialect: z.function(),
  plugins: z.array(z.object({}).loose()).optional(),
  computedFields: z.object({}).loose().optional(),
})

export const databaseModuleConfigSchema = z.object({
  default: z.string().min(1, withZodI18n('database.defaultConnectionRequired')),
  connections: z.array(databaseConnectionSchema).min(1, withZodI18n('database.connectionRequired')),
}).refine(
  (config) => {
    const names = config.connections.map(c => c.name)
    return new Set(names).size === names.length
  },
  withZodI18n('database.duplicateConnections')
).refine(
  (config) => config.connections.some(c => c.name === config.default),
  withZodI18n('database.defaultConnectionNotFound')
)

type ZenStackClientInstance = InstanceType<typeof ZenStackClient>

/**
 * Wrap a ZenStack client so `$transaction` is reentrant: when a transaction is
 * already open on this connection (tracked per-connection via
 * {@link AsyncLocalStorage}), nested calls run within the active transaction's
 * client instead of opening a new one. ZenStack only reuses a connection when
 * `$transaction` is called on a transaction client; callers holding the base
 * client (e.g. the better-auth adapter, which since better-auth 1.6.11 nests
 * transactions to atomically consume verification rows) would otherwise open a
 * fresh transaction. On a small pool (e.g. a Hyperdrive-fronted `max: 1` pg
 * pool) that inner transaction blocks forever waiting for the connection the
 * outer one holds — a deadlock surfacing as a backend stuck `idle in
 * transaction`. Reusing the active client is also the correct semantics: nested
 * transactions form a single atomic unit.
 *
 * ZenStackClient's constructor returns a Proxy (for dynamic model accessors), so
 * a subclass method override is shadowed — hence the proxy wrapper here.
 */
function makeReentrantTransaction<T extends object>(
  client: T,
  activeTransaction: AsyncLocalStorage<ZenStackClientInstance>,
): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== '$transaction') {
        // Forward the receiver so getters/methods resolve `this` against the
        // proxy (correct for layered proxies / accessor properties).
        return Reflect.get(target, prop, receiver)
      }
      // Read the original `$transaction` off the target WITHOUT the receiver — a
      // receiver of the proxy would re-enter this trap and recurse infinitely.
      const transaction = Reflect.get(target, prop) as (
        input: unknown,
        options?: unknown,
      ) => unknown
      return (input: unknown, options?: unknown) => {
        const active = activeTransaction.getStore()
        if (active) {
          return typeof input === 'function'
            ? (input as (tx: ZenStackClientInstance) => unknown)(active)
            : (active.$transaction as (i: unknown, o?: unknown) => unknown)(input, options)
        }
        if (typeof input !== 'function') {
          return transaction.call(target, input, options)
        }
        return transaction.call(
          target,
          (tx: ZenStackClientInstance) =>
            activeTransaction.run(tx, () => (input as (t: ZenStackClientInstance) => unknown)(tx)),
          options,
        )
      }
    },
  })
}

export function createDatabaseService(
  conn: DatabaseConnectionConfig,
  eventRegistry: IEventRegistry,
): new () => InstanceType<typeof ZenStackClient> {
  const plugins: AnyPlugin[] = [
    new ErrorHandlerPlugin(),
    new EventEmitterPlugin({
      eventRegistry,
    }),
    ...(conn.plugins ?? []),
  ]

  // Tracks the in-flight interactive transaction client for this connection so
  // nested `$transaction` calls reuse it instead of acquiring a second
  // connection. ZenStack's own reuse only triggers when `$transaction` is
  // invoked on a transaction client; callers that hold the base client (e.g.
  // the better-auth adapter, which since better-auth 1.6.11 nests transactions
  // to atomically consume verification rows) instead open a fresh transaction.
  // On a small pool (e.g. a Hyperdrive-fronted `max: 1` pg pool) the inner
  // transaction then blocks forever waiting for the connection the outer one
  // holds — a deadlock that surfaces as a Postgres backend stuck `idle in
  // transaction`. Reusing the active client makes nested transactions share the
  // single connection, which is also the correct semantics (one atomic unit).
  const activeTransaction = new AsyncLocalStorage<InstanceType<typeof ZenStackClient>>()

  @Transient()
  class DatabaseClient extends ZenStackClient<typeof conn.schema> {
    constructor() {
      const dialect = conn.dialect()
      // ZenStack 3+ requires `computedFields` whenever the schema declares any
      // `@computed` fields, so pass them through when the consumer provides them.
      super(conn.schema, {
        dialect,
        plugins,
        // @ts-expect-error - ZenStack 3+ requires `computedFields` whenever the schema declares any `@computed` fields, so pass them through when the consumer provides them.
        computedFields: conn.computedFields
      })
      // ZenStackClient's constructor returns a Proxy (for dynamic model
      // accessors), so subclass method overrides are shadowed. Wrap it in a
      // proxy that makes `$transaction` reentrant. Returning from the
      // constructor replaces the instance DI receives.
      return makeReentrantTransaction(this as InstanceType<typeof ZenStackClient>, activeTransaction)
    }
  }

  return DatabaseClient
}
