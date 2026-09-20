import { beforeEach, describe, expect, it, vi } from 'vitest'

// Inject a fake pg via module mock so no real Postgres is needed.
interface FakeClient {
  queries: string[]
  ended: boolean
}
const clients: FakeClient[] = []
/** Lease slots another session holds. */
let heldSlots: number[] = []
/** Errors CREATE DATABASE raises, in order, before it succeeds. */
let createErrors: { code: string }[] = []
let createAttempts = 0

vi.mock('pg', () => {
  class Client {
    state: FakeClient = { queries: [], ended: false }
    constructor() {
      clients.push(this.state)
    }
    connect(): Promise<void> {
      return Promise.resolve()
    }
    end(): Promise<void> {
      this.state.ended = true
      return Promise.resolve()
    }
    query(sql: string): Promise<{ rows: unknown[] }> {
      this.state.queries.push(sql)
      const lease = /pg_try_advisory_lock\(hashtext\('stratal:worker-db-lease:[^:]+:(\d+)'\)\)/.exec(sql)
      if (lease) return Promise.resolve({ rows: [{ acquired: !heldSlots.includes(Number(lease[1])) }] })
      if (/^CREATE DATABASE/.test(sql)) {
        createAttempts += 1
        const error = createErrors.shift()
        if (error) return Promise.reject(Object.assign(new Error('create failed'), error))
      }
      return Promise.resolve({ rows: [] })
    }
  }
  return { default: { Client } }
})

const { cloneWorkerDatabase, leaseWorkerDatabase } = await import('../test-database')

const allQueries = (): string[] => clients.flatMap((c) => c.queries)

beforeEach(() => {
  clients.length = 0
  heldSlots = []
  createErrors = []
  createAttempts = 0
})

describe('cloneWorkerDatabase', () => {
  it('drops the previous copy and clones the template, in that order', async () => {
    await cloneWorkerDatabase('postgres://u:p@h:5432/postgres', 'app_w_1', 'app_template')
    const queries = allQueries()
    const drop = queries.indexOf('DROP DATABASE IF EXISTS "app_w_1" WITH (FORCE)')
    const create = queries.indexOf('CREATE DATABASE "app_w_1" TEMPLATE "app_template"')
    expect(drop).toBeGreaterThanOrEqual(0)
    expect(create).toBeGreaterThan(drop)
  })

  it('serializes the clone under a template-keyed advisory lock, released after CREATE', async () => {
    await cloneWorkerDatabase('postgres://u:p@h:5432/postgres', 'app_w_2', 'app_template')
    const queries = allQueries()
    const lock = queries.findIndex((q) => q.includes("pg_advisory_lock(hashtext('stratal:worker-db-clone:app_template'))"))
    const create = queries.findIndex((q) => q.startsWith('CREATE DATABASE'))
    const unlock = queries.findIndex((q) => q.includes("pg_advisory_unlock(hashtext('stratal:worker-db-clone:app_template'))"))
    expect(lock).toBeGreaterThanOrEqual(0)
    expect(lock).toBeLessThan(create)
    expect(create).toBeLessThan(unlock)
  })

  it('retries CREATE on a transient 55006 (template momentarily in use), then succeeds', async () => {
    createErrors = [{ code: '55006' }]
    await expect(cloneWorkerDatabase('postgres://u:p@h:5432/postgres', 'app_w_1', 'app_template')).resolves.toBeUndefined()
    expect(createAttempts).toBe(2)
  })

  it('surfaces any other CREATE failure and still releases the clone lock', async () => {
    createErrors = [{ code: '53100' }]
    await expect(cloneWorkerDatabase('postgres://u:p@h:5432/postgres', 'app_w_1', 'app_template')).rejects.toThrow('create failed')
    expect(allQueries().some((q) => q.includes('pg_advisory_unlock'))).toBe(true)
  })
})

describe('leaseWorkerDatabase', () => {
  const base = 'postgres://u:p@h:5432/app_test'

  it('leases the lowest free slot and points at its database', async () => {
    const lease = await leaseWorkerDatabase(base)
    expect(lease.name).toBe('app_test_w_0')
    expect(lease.connectionString).toBe('postgres://u:p@h:5432/app_test_w_0')
  })

  it('skips slots another session holds', async () => {
    heldSlots = [0, 1, 3]
    const lease = await leaseWorkerDatabase(base)
    expect(lease.name).toBe('app_test_w_2')
  })

  it('clones a fresh copy of the template into the leased database', async () => {
    heldSlots = [0]
    await leaseWorkerDatabase(base)
    expect(allQueries()).toContain('CREATE DATABASE "app_test_w_1" TEMPLATE "app_test_template"')
  })

  it('keeps the lease connection open, since closing it would free the slot', async () => {
    await leaseWorkerDatabase(base)
    const leaseClient = clients.find((c) => c.queries.some((q) => q.includes('pg_try_advisory_lock')))
    expect(leaseClient?.ended).toBe(false)
  })

  it('closes the lease connection when the clone fails', async () => {
    createErrors = [{ code: '53100' }]
    await expect(leaseWorkerDatabase(base)).rejects.toThrow('create failed')
    const leaseClient = clients.find((c) => c.queries.some((q) => q.includes('pg_try_advisory_lock')))
    expect(leaseClient?.ended).toBe(true)
  })
})
