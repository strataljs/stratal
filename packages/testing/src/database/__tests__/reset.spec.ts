import { describe, expect, it, vi } from 'vitest'
import { buildTableDiscoverySql, buildTruncateSql } from '../reset'

describe('buildTruncateSql', () => {
  it('quotes and joins schema-qualified tables into one TRUNCATE', () => {
    const sql = buildTruncateSql([
      { schema: 'public', table: 'users' },
      { schema: 'public', table: 'orders' },
    ])
    expect(sql).toBe('TRUNCATE "public"."users", "public"."orders" RESTART IDENTITY CASCADE')
  })
  it('quotes each part independently so a dotted identifier is not mis-split', () => {
    const sql = buildTruncateSql([{ schema: 'public', table: 'my.table' }])
    expect(sql).toBe('TRUNCATE "public"."my.table" RESTART IDENTITY CASCADE')
  })
  it('escapes embedded double quotes', () => {
    const sql = buildTruncateSql([{ schema: 'public', table: 'we"ird' }])
    expect(sql).toBe('TRUNCATE "public"."we""ird" RESTART IDENTITY CASCADE')
  })
  it('returns empty string for no tables (caller skips)', () => {
    expect(buildTruncateSql([])).toBe('')
  })
})

describe('buildTableDiscoverySql', () => {
  it('always includes current_schema() and excludes _prisma% bookkeeping', () => {
    const sql = buildTableDiscoverySql([], [])
    expect(sql).toContain('schemaname IN (current_schema())')
    expect(sql).toContain("tablename NOT LIKE '_prisma%'")
  })

  it('quotes and escapes extra schemas', () => {
    const sql = buildTableDiscoverySql(["tenant's_schema", 'other'], [])
    expect(sql).toContain("schemaname IN (current_schema(), 'tenant''s_schema', 'other')")
  })

  it('treats a schema literally named "current" as a string literal, not current_schema()', () => {
    const sql = buildTableDiscoverySql(['current'], [])
    expect(sql).toContain("schemaname IN (current_schema(), 'current')")
  })

  it('adds preserve patterns as additional NOT LIKE clauses, alongside _prisma%', () => {
    const sql = buildTableDiscoverySql([], ['reference_%', "o'brien_seed"])
    expect(sql).toContain(
      "tablename NOT LIKE '_prisma%' AND tablename NOT LIKE 'reference_%' AND tablename NOT LIKE 'o''brien_seed'",
    )
  })

  it('selects schemaname and tablename from pg_tables', () => {
    const sql = buildTableDiscoverySql([], [])
    expect(sql).toBe(
      "SELECT schemaname::text AS schemaname, tablename::text AS tablename FROM pg_tables WHERE schemaname IN (current_schema()) AND tablename NOT LIKE '_prisma%'",
    )
  })
})

// Inject a fake pg via module mock so no real Postgres is needed.
const queries: string[] = []
let discoveryRows: { schemaname: string; tablename: string }[] = []
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
      if (/FROM pg_tables/i.test(sql)) return Promise.resolve({ rows: discoveryRows })
      return Promise.resolve({ rows: [] })
    }
  }
  return { default: { Client } }
})

import { resetWorkerDatabase } from '../reset'

describe('resetWorkerDatabase', () => {
  it('issues a TRUNCATE over exactly the discovered tables', async () => {
    queries.length = 0
    discoveryRows = [
      { schemaname: 'public', tablename: 'users' },
      { schemaname: 'public', tablename: 'orders' },
    ]
    await resetWorkerDatabase('postgres://u:p@h:5432/app', {})
    const discoverySql = queries.find((q) => /FROM pg_tables/i.test(q))
    expect(discoverySql).toBeDefined()
    const truncateSql = queries.find((q) => /^TRUNCATE/i.test(q))
    expect(truncateSql).toBe('TRUNCATE "public"."users", "public"."orders" RESTART IDENTITY CASCADE')
  })

  it('issues no TRUNCATE when discovery returns zero rows', async () => {
    queries.length = 0
    discoveryRows = []
    await resetWorkerDatabase('postgres://u:p@h:5432/app', {})
    const truncateSql = queries.find((q) => /^TRUNCATE/i.test(q))
    expect(truncateSql).toBeUndefined()
  })

  it('passes schemas/preserve options through to the discovery query', async () => {
    queries.length = 0
    discoveryRows = []
    await resetWorkerDatabase('postgres://u:p@h:5432/app', {
      schemas: ['tenant'],
      preserve: ['reference_%'],
    })
    const discoverySql = queries.find((q) => /FROM pg_tables/i.test(q))
    expect(discoverySql).toContain("'tenant'")
    expect(discoverySql).toContain("tablename NOT LIKE 'reference_%'")
  })
})
