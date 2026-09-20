import { AsyncLocalStorage } from 'node:async_hooks'
import { Container, isDisposable, lazy } from 'stratal/di'
import type { IEventRegistry } from 'stratal/events'
import type { RouterContext } from 'stratal/router'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseConnectionConfig } from '../database.module'
import { createDatabaseService, makeReentrantTransaction } from '../database.helpers'
import { connectionSymbol } from '../database.tokens'

function createFakeClient() {
  return {
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn(),
  }
}

// EventEmitterPlugin only stores the registry at construction; a bare object suffices.
const fakeEventRegistry = { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as unknown as IEventRegistry

describe('makeReentrantTransaction (disposal)', () => {
  it('exposes Symbol.asyncDispose that disconnects the underlying client', async () => {
    const client = createFakeClient()
    const proxied = makeReentrantTransaction(client, new AsyncLocalStorage())

    await (proxied as unknown as AsyncDisposable)[Symbol.asyncDispose]()

    expect(client.$disconnect).toHaveBeenCalledOnce()
  })

  it('satisfies the stratal Disposable contract so container disposal reaches it', () => {
    const proxied = makeReentrantTransaction(createFakeClient(), new AsyncLocalStorage())

    expect(isDisposable(proxied)).toBe(true)
  })
})

describe('createDatabaseService (dialect lifecycle)', () => {
  function makeConn(dialect: ReturnType<typeof vi.fn>): DatabaseConnectionConfig {
    return { name: 'main', schema: {}, dialect, plugins: [] } as unknown as DatabaseConnectionConfig
  }

  it('builds a FRESH dialect (and its pg pool) on every resolution — never memoized across instances', () => {
    // Regression guard for the "second request hangs" failure mode on serverless
    // runtimes (e.g. Cloudflare Workers). A connection pool/socket opened inside one
    // request's I/O context cannot be reused by a later request — the runtime cancels
    // the cross-request I/O and the request hangs until it is force-cancelled. The
    // `@Request` DatabaseClient therefore MUST call `conn.dialect()` in every
    // constructor so each request owns its own pool. If a memoized dialect is ever
    // reintroduced (e.g. `sharedDialect ??= conn.dialect()`), this count collapses to 1.
    // The spy must RETURN (not throw): a memoized `sharedDialect ??= conn.dialect()`
    // only caches once the call resolves, so a throwing spy would hide the bug by
    // never populating the cache. Each call returns a distinct sentinel so we can
    // also assert no two resolutions shared a dialect.
    const built: object[] = []
    const dialect = vi.fn(() => {
      const d = {}
      built.push(d)
      return d
    })
    const Service = createDatabaseService(makeConn(dialect), fakeEventRegistry)

    const resolutions = 4
    for (let i = 0; i < resolutions; i++) {
      try {
        // eslint-disable-next-line no-new -- constructing for its dialect()-call side effect
        new Service()
      } catch {
        /* super() may reject the empty fake schema; `conn.dialect()` already ran first */
      }
    }

    // A memoized/shared dialect collapses both of these to 1.
    expect(dialect).toHaveBeenCalledTimes(resolutions)
    expect(new Set(built).size).toBe(resolutions)
  })
})

describe('createDatabaseService (resolution scope)', () => {
  /**
   * Enough of a Kysely dialect for `ZenStackClient` to finish constructing.
   * Nothing here is ever driven — the scope decides how many clients exist,
   * which is settled before a query is issued.
   */
  function stubDialect() {
    // Resolved rather than `async () => {}`: these stand in for a driver that is
    // never driven, and an empty async body is an empty function either way.
    const settled = () => Promise.resolve()

    return {
      createDriver: () => ({
        init: settled,
        acquireConnection: () => Promise.resolve({}),
        releaseConnection: settled,
        beginTransaction: settled,
        commitTransaction: settled,
        rollbackTransaction: settled,
        destroy: settled,
      }),
      createAdapter: () => ({ supportsReturning: true, supportsTransactionalDdl: false }),
      createIntrospector: () => ({}),
      createQueryCompiler: () => ({}),
    }
  }

  function makeConn(): DatabaseConnectionConfig {
    return {
      name: 'main',
      // A real (empty) schema rather than `{}`: the client has to construct for
      // a resolution to reach the container's cache at all.
      schema: { provider: { type: 'postgresql' }, models: {}, plugins: {} },
      dialect: stubDialect,
      plugins: [],
    } as unknown as DatabaseConnectionConfig
  }

  /**
   * How many pools a request opens is decided here, and nowhere else.
   *
   * A transient client hands every injecting service its own — so a request
   * resolving a controller, a guard and four services built six ZenStack
   * clients over six pools for work sharing one I/O context. Resolving the
   * connection token twice inside one scope is what that regression looks like
   * from the outside: two instances instead of one.
   */
  it('gives one client to every resolution within a request scope', () => {
    const container = new Container()
    const Service = createDatabaseService(makeConn(), fakeEventRegistry)
    container.register(connectionSymbol('main'), lazy(() => Service))

    const scope = container.createRequestScope({} as unknown as RouterContext)

    expect(scope.resolve(connectionSymbol('main'))).toBe(scope.resolve(connectionSymbol('main')))
  })

  /**
   * The other half of the same rule, and the reason this is `@Request` and not
   * `@Singleton`: a pool opened inside one request's I/O context cannot be
   * reused by a later one — workerd cancels the cross-request I/O and the
   * second request hangs forever. Sharing one client across scopes is that bug.
   */
  it('gives a different client to a different request scope', () => {
    const container = new Container()
    const Service = createDatabaseService(makeConn(), fakeEventRegistry)
    container.register(connectionSymbol('main'), lazy(() => Service))

    const first = container.createRequestScope({} as unknown as RouterContext)
    const second = container.createRequestScope({} as unknown as RouterContext)

    expect(first.resolve(connectionSymbol('main'))).not.toBe(second.resolve(connectionSymbol('main')))
  })
})
