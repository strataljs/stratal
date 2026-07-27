import { AsyncLocalStorage } from 'node:async_hooks'
import { isDisposable } from 'stratal/di'
import type { IEventRegistry } from 'stratal/events'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseConnectionConfig } from '../database.module'
import { createDatabaseService, makeReentrantTransaction } from '../database.helpers'

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
    // `@Transient` DatabaseClient therefore MUST call `conn.dialect()` in every
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
