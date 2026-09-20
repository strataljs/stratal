// A run reclaims its own worker databases as it ends.
//
// The sweep matches on the base database's name, so no other process ever sees
// these databases — nothing else will reclaim them, and a pile of them is bounded
// by nothing. What the guard buys is that running it here is still safe next to a
// concurrent process.
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

const queries: string[] = []
let sweepRows: { datname: string }[] = []
/** Lease slots another session holds; the sweep's own try-lock fails for these. */
let heldSlots: number[] = []

vi.mock('pg', () => {
  class Client {
    connect(): Promise<void> {
      return Promise.resolve()
    }
    end(): Promise<void> {
      return Promise.resolve()
    }
    query(sql: string): Promise<{ rows: unknown[] }> {
      queries.push(sql)
      // The sweep's own lookup: databases matching the prefix with no backend
      // attached. Everything else (locks, comments, fingerprint reads) is empty.
      if (/FROM pg_database d/i.test(sql)) return Promise.resolve({ rows: sweepRows })
      const lease = /pg_try_advisory_lock\(hashtext\('stratal:worker-db-lease:[^:]+:(\d+)'\)\)/.exec(sql)
      if (lease) return Promise.resolve({ rows: [{ acquired: !heldSlots.includes(Number(lease[1])) }] })
      if (/shobj_description|pg_database/i.test(sql)) return Promise.resolve({ rows: [] })
      return Promise.resolve({ rows: [] })
    }
  }
  return { default: { Client } }
})

const { createTestDatabaseGlobalSetup } = await import('../test-database')

/**
 * A setup pointed at a real file, because the template fingerprint is computed
 * from schema sources and refuses an empty set. Which file is immaterial — these
 * tests are about what the run does when it ends.
 */
// `.href` rather than the `URL` itself: the DOM `URL` in the ambient lib is not the
// `node:url` one `fileURLToPath` is typed against.
const SCHEMA_SOURCE = fileURLToPath(new URL('../test-database.ts', import.meta.url).href)

/** A template that is already current, so no run here reaches the migrate step. */
const migrate = (): void => undefined

function setupFor() {
  return createTestDatabaseGlobalSetup({
    connectionString: 'postgres://u:p@localhost:5432/app_test',
    schema: SCHEMA_SOURCE,
    migrate,
  })
}

describe('global setup teardown', () => {
  it('returns a teardown, so the run can take its databases with it', async () => {
    queries.length = 0
    sweepRows = []

    const teardown = await setupFor()()

    expect(typeof teardown).toBe('function')
  })

  it('drops this run\'s worker databases when the run ends', async () => {
    queries.length = 0
    sweepRows = []
    heldSlots = []

    const teardown = await setupFor()()

    // What the run leaves: by teardown its files have finished, so their
    // databases hold no connections and their lease slots are free.
    sweepRows = [{ datname: 'app_test_w_0' }, { datname: 'app_test_w_1' }]
    queries.length = 0
    await teardown()

    expect(queries).toContain('DROP DATABASE IF EXISTS "app_test_w_0" WITH (FORCE)')
    expect(queries).toContain('DROP DATABASE IF EXISTS "app_test_w_1" WITH (FORCE)')
  })

  it('keeps a worker database whose lease is held, even with no connection yet', async () => {
    sweepRows = []
    heldSlots = []
    const teardown = await setupFor()()

    // Slot 1 was just leased by a concurrent process: cloned, but not yet
    // connected to, so only its lease says it is in use.
    sweepRows = [{ datname: 'app_test_w_0' }, { datname: 'app_test_w_1' }]
    heldSlots = [1]
    queries.length = 0
    await teardown()

    expect(queries).toContain('DROP DATABASE IF EXISTS "app_test_w_0" WITH (FORCE)')
    expect(queries).not.toContain('DROP DATABASE IF EXISTS "app_test_w_1" WITH (FORCE)')
  })

  it('releases each slot lock it takes to drop a database', async () => {
    sweepRows = []
    heldSlots = []
    const teardown = await setupFor()()

    sweepRows = [{ datname: 'app_test_w_3' }]
    queries.length = 0
    await teardown()

    const drop = queries.indexOf('DROP DATABASE IF EXISTS "app_test_w_3" WITH (FORCE)')
    const unlock = queries.findIndex((q) => q.includes("pg_advisory_unlock(hashtext('stratal:worker-db-lease:app_test_template:3'))"))
    expect(drop).toBeGreaterThanOrEqual(0)
    expect(unlock).toBeGreaterThan(drop)
  })

  it('never drops a database that only shares the prefix', async () => {
    sweepRows = []
    heldSlots = []
    const teardown = await setupFor()()

    sweepRows = [{ datname: 'app_test_w_extra' }]
    queries.length = 0
    await teardown()

    expect(queries.filter((q) => q.startsWith('DROP DATABASE'))).toEqual([])
  })

  /**
   * The guard is what makes a teardown safe where a blanket drop would not be: a
   * concurrent process's databases still have its workers attached, so they never
   * appear in the sweep's result and are never named in a DROP.
   */
  it('drops nothing when every matching database still has a connection', async () => {
    const teardown = await setupFor()()

    sweepRows = []
    queries.length = 0
    await teardown()

    expect(queries.filter((q) => q.startsWith('DROP DATABASE'))).toEqual([])
  })

})
