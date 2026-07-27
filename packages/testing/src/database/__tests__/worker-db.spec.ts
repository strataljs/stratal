import { describe, expect, it } from 'vitest'
import { databasePrefix, deriveFileDbName } from '../test-database'

describe('deriveFileDbName', () => {
  it('is deterministic per (base, token)', () => {
    const base = 'postgres://u:p@localhost:5432/data_plane_test'
    expect(deriveFileDbName(base, 'abc123')).toBe('data_plane_test_f_abc123')
    expect(deriveFileDbName(base, 'abc123')).toBe('data_plane_test_f_abc123')
  })
  it('differs per token (so no two files share a database)', () => {
    const base = 'postgres://u:p@localhost:5432/app_test'
    expect(deriveFileDbName(base, 'aaa')).not.toBe(deriveFileDbName(base, 'bbb'))
  })
  it('rejects a base name that would exceed 63 chars', () => {
    const long = 'a'.repeat(55)
    const base = `postgres://u:p@localhost:5432/${long}`
    expect(() => deriveFileDbName(base, 'abcdef0123456789')).toThrow(/identifier limit/)
  })
})

describe('databasePrefix', () => {
  it('is the per-file sweep key and does NOT match the template database', () => {
    const base = 'postgres://u:p@localhost:5432/app_test'
    const prefix = databasePrefix(base)
    expect(prefix).toBe('app_test_f_')
    expect(deriveFileDbName(base, 'tok').startsWith(prefix)).toBe(true)
    expect('app_test_template'.startsWith(prefix)).toBe(false) // sweep must never drop the template
  })
})
