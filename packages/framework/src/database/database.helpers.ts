import { ZenStackClient, type AnyPlugin } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import { AsyncLocalStorage } from 'node:async_hooks';
import { array, custom, looseObject, minLength, object, optional, refine, string } from 'zod/mini';
import { Request as RequestScoped } from 'stratal/di';
import type { IEventRegistry } from 'stratal/events';
import type { LoggerService } from 'stratal/logger';
import { withZodI18n } from 'stratal/validation';
import type { DatabaseConnectionConfig } from './database.module';
import { createCursorReader } from './pagination/cursor-reader';
import { ErrorHandlerPlugin, EventEmitterPlugin } from './plugins';

const databaseConnectionSchema = object({
  name: string().check(minLength(1, withZodI18n('database.connectionNameRequired'))),
  schema: looseObject({}),
  dialect: custom((value) => typeof value === 'function'),
  plugins: optional(array(looseObject({}))),
  computedFields: optional(looseObject({})),
})

export const databaseModuleConfigSchema = object({
  default: string().check(minLength(1, withZodI18n('database.defaultConnectionRequired'))),
  connections: array(databaseConnectionSchema).check(minLength(1, withZodI18n('database.connectionRequired'))),
}).check(
  refine(
    (config: { connections: { name: string }[] }) => {
      const names = config.connections.map((c) => c.name)
      return new Set(names).size === names.length
    },
    withZodI18n('database.duplicateConnections'),
  ),
  refine(
    (config: { connections: { name: string }[]; default: string }) =>
      config.connections.some((c) => c.name === config.default),
    withZodI18n('database.defaultConnectionNotFound'),
  ),
)

type ZenStackClientInstance = InstanceType<typeof ZenStackClient>

/**
 * Puts `$cursor` on a client, base or transaction.
 *
 * Defined on the client rather than contributed as a ZenStack plugin because
 * the client proxy hands a plugin's member back unbound, and this one has to
 * reach the client's own model delegates. Non-enumerable so it stays out of
 * enumeration of the client, and skipped when already present — a reentrant
 * `$transaction` hands back a client that has been through here.
 */
function defineCursorReader(client: object, schema: SchemaDef): void {
  if ('$cursor' in client) return

  Object.defineProperty(client, '$cursor', {
    value: createCursorReader(client, schema),
    enumerable: false,
    configurable: true,
  })
}

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
 *
 * `prepareTransactionClient` runs against every transaction client before the
 * callback sees it, which is how the built-in members reach it. ZenStack builds
 * that client itself and types it with its own contract, so there is no other
 * point at which it passes through this package.
 */
export function makeReentrantTransaction<T extends object>(
  client: T,
  activeTransaction: AsyncLocalStorage<ZenStackClientInstance>,
  prepareTransactionClient?: (tx: ZenStackClientInstance) => void,
): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      // DI disposal contract (stratal `Disposable`): release the underlying
      // pool/socket when the owning container shuts down (e.g. a Vite HMR
      // reload replacing the Application). Handled here because ZenStack's
      // own constructor proxy shadows subclass method definitions.
      if (prop === Symbol.asyncDispose) {
        return () => (target as ZenStackClientInstance).$disconnect()
      }
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
          (tx: ZenStackClientInstance) => {
            prepareTransactionClient?.(tx)
            return activeTransaction.run(tx, () => (input as (t: ZenStackClientInstance) => unknown)(tx))
          },
          options,
        )
      }
    },
  })
}

export interface DatabaseServiceClass {
  new (): InstanceType<typeof ZenStackClient>
  /**
   * Disconnects every still-live client created from this service class.
   * Called by `DatabaseModule.onShutdown` so pools/sockets are released when
   * the Application is torn down (e.g. a Vite HMR reload). The module passes its
   * {@link LoggerService} so disconnect failures are reported through the
   * application logger rather than the bare console.
   */
  disposeInstances(logger: LoggerService): Promise<void>
}

export function createDatabaseService(
  conn: DatabaseConnectionConfig,
  eventRegistry: IEventRegistry,
): DatabaseServiceClass {
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

  // Live clients created from this service class, tracked weakly: one per
  // request scope, so each stays GC-able with its request. Dead refs are pruned
  // on each add; live ones are disconnected by `disposeInstances()` on module
  // shutdown.
  //
  // The dialect (and the pg pool it carries) is built FRESH per REQUEST —
  // `conn.dialect()` in the constructor below. This is MANDATORY on the Workers
  // runtime: a pool/socket opened inside one request's I/O context cannot be
  // reused by a later request — workerd cancels the cross-request I/O and the
  // request hangs forever ("the Worker's code had hung and would never generate
  // a response"). Memoizing one shared dialect across requests therefore breaks
  // every request after the first, which is why this is `@Request` rather than
  // `@Singleton`.
  //
  // It is `@Request` rather than `@Transient` because the scope is what decides
  // how many pools a request opens. Transient hands every injecting service its
  // own client, so a request resolving a controller, a guard and four services
  // built six ZenStack clients over six pools — each one a fresh schema walk and
  // its own set of connections — for work that shares a single I/O context. The
  // request scope is the widest one a pool may legally span here, so it is the
  // right one: one client, one pool, per request.
  //
  // Every entrypoint already runs inside a request scope — HTTP through
  // `createRequestScope`, and queues, cron, seeders, quarry commands, Durable
  // Objects, Workflows and WorkerEntrypoints through `runInRequestScope` /
  // `runInScope` — so this costs no caller a change.
  //
  // Pool cleanup is at MODULE SHUTDOWN only: `disposeInstances()` disconnects the
  // still-live clients tracked here. The framework does not dispose pools per
  // request, so a pool whose client is GC'd before shutdown is NOT explicitly
  // `$disconnect()`ed — its idle connections are reclaimed by `pg`'s
  // own `idleTimeoutMillis` instead. On the primary target (Workers + Hyperdrive)
  // Hyperdrive fronts these pools and multiplexes the real server connections, so
  // they never accumulate. Consumers deploying against a DIRECT Postgres on a
  // long-lived isolate should give `conn.dialect()` a pool with a short
  // `idleTimeoutMillis` so any leaked-idle connection self-closes promptly.
  const instances = new Set<WeakRef<ZenStackClientInstance>>()

  @RequestScoped()
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
      defineCursorReader(this, conn.schema)

      // ZenStackClient's constructor returns a Proxy (for dynamic model
      // accessors), so subclass method overrides are shadowed. Wrap it in a
      // proxy that makes `$transaction` reentrant. Returning from the
      // constructor replaces the instance DI receives.
      const client = makeReentrantTransaction(
        this as InstanceType<typeof ZenStackClient>,
        activeTransaction,
        (tx) => defineCursorReader(tx, conn.schema),
      )
      for (const ref of instances) {
        if (ref.deref() === undefined) instances.delete(ref)
      }
      instances.add(new WeakRef(client))
      return client
    }

    static async disposeInstances(logger: LoggerService): Promise<void> {
      const live = [...instances]
      instances.clear()
      await Promise.all(live.map(async (ref) => {
        const client = ref.deref()
        if (!client) return
        try {
          await client.$disconnect()
        } catch (error) {
          logger.error(
            `Failed to disconnect database client "${conn.name}"`,
            error instanceof Error ? error : new Error(String(error)),
          )
        }
      }))
    }
  }

  return DatabaseClient
}
