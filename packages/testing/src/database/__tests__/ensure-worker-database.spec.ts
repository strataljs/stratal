import { describe, expect, it, vi } from 'vitest'

// Inject a fake pg via module mock so no real Postgres is needed.
const queries: string[] = []
let existsRows: { one: number }[] = []
vi.mock('pg', () => {
  class Client {
    connect() {
      return Promise.resolve()
    }
    end() {
      return Promise.resolve()
    }
    query(sql: string) {
      queries.push(sql)
      if (/FROM pg_database/i.test(sql)) return Promise.resolve({ rows: existsRows })
      return Promise.resolve({ rows: [] })
    }
  }
  return { default: { Client } }
})

import { ensureWorkerDatabase } from '../test-database'

describe('ensureWorkerDatabase', () => {
  it('clones from template when the database is absent', async () => {
    queries.length = 0
    existsRows = [] // absent
    await ensureWorkerDatabase('postgres://u:p@h:5432/postgres', 'app_w1', 'app_template')
    expect(queries.some((q) => q.includes('CREATE DATABASE "app_w1" TEMPLATE "app_template"'))).toBe(true)
  })

  it('does NOT issue CREATE or take the advisory lock when the database already exists', async () => {
    queries.length = 0
    existsRows = [{ one: 1 }] // present
    await ensureWorkerDatabase('postgres://u:p@h:5432/postgres', 'app_w1', 'app_template')
    expect(queries.some((q) => q.includes('CREATE DATABASE'))).toBe(false)
    expect(queries.some((q) => /pg_advisory_lock/i.test(q))).toBe(false)
  })

  it('serializes the clone under a template-keyed advisory lock, released after CREATE', async () => {
    queries.length = 0
    existsRows = [] // absent
    await ensureWorkerDatabase('postgres://u:p@h:5432/postgres', 'app_w2', 'app_template')
    const lockIdx = queries.findIndex((q) => /pg_advisory_lock\(/i.test(q))
    const createIdx = queries.findIndex((q) => /CREATE DATABASE/i.test(q))
    const unlockIdx = queries.findIndex((q) => /pg_advisory_unlock\(/i.test(q))
    expect(lockIdx).toBeGreaterThanOrEqual(0)
    expect(lockIdx).toBeLessThan(createIdx) // lock acquired before cloning
    expect(createIdx).toBeLessThan(unlockIdx) // lock released only after cloning
  })

  it('swallows a concurrent 42P04 (already exists) as success', async () => {
    queries.length = 0
    existsRows = [] // looked absent, but CREATE races and fails 42P04
    const { default: pg } = (await import('pg')) as unknown as {
      default: { Client: { prototype: { query: (s: string) => Promise<unknown> } } }
    }
    const spy = vi.spyOn(pg.Client.prototype, 'query').mockImplementation((sql: string) => {
      if (/FROM pg_database/i.test(sql)) return Promise.resolve({ rows: [] })
      if (/CREATE DATABASE/i.test(sql))
        return Promise.reject(Object.assign(new Error('exists'), { code: '42P04' }))
      return Promise.resolve({ rows: [] })
    })
    await expect(
      ensureWorkerDatabase('postgres://u:p@h:5432/postgres', 'app_w1', 'app_template'),
    ).resolves.toBeUndefined()
    spy.mockRestore()
  })

  it('retries CREATE on a transient 55006 (template momentarily in use), then succeeds', async () => {
    const { default: pg } = (await import('pg')) as unknown as {
      default: { Client: { prototype: { query: (s: string) => Promise<unknown> } } }
    }
    let createAttempts = 0
    const spy = vi.spyOn(pg.Client.prototype, 'query').mockImplementation((sql: string) => {
      if (/FROM pg_database/i.test(sql)) return Promise.resolve({ rows: [] })
      if (/CREATE DATABASE/i.test(sql)) {
        createAttempts += 1
        if (createAttempts === 1)
          return Promise.reject(Object.assign(new Error('template in use'), { code: '55006' }))
        return Promise.resolve({ rows: [] })
      }
      return Promise.resolve({ rows: [] }) // advisory lock/unlock
    })
    await expect(
      ensureWorkerDatabase('postgres://u:p@h:5432/postgres', 'app_w1', 'app_template'),
    ).resolves.toBeUndefined()
    expect(createAttempts).toBe(2) // failed once on 55006, retried and succeeded
    spy.mockRestore()
  })
})
