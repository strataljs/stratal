import { describe, expect, it } from 'vitest'
import { databasePrefix, deriveWorkerDbName } from '../test-database'

describe('deriveWorkerDbName', () => {
  it('names the database behind a lease slot', () => {
    const base = 'postgres://u:p@localhost:5432/suite_test'
    expect(deriveWorkerDbName(base, 0)).toBe('suite_test_w_0')
    expect(deriveWorkerDbName(base, 12)).toBe('suite_test_w_12')
  })
  it('gives each slot its own database', () => {
    const base = 'postgres://u:p@localhost:5432/app_test'
    expect(deriveWorkerDbName(base, 1)).not.toBe(deriveWorkerDbName(base, 2))
  })
  it('rejects a base name that would exceed 63 chars', () => {
    const long = 'a'.repeat(60)
    const base = `postgres://u:p@localhost:5432/${long}`
    expect(() => deriveWorkerDbName(base, 1)).toThrow(/identifier limit/)
  })
})

describe('databasePrefix', () => {
  it('is the worker sweep key and does NOT match the template database', () => {
    const base = 'postgres://u:p@localhost:5432/app_test'
    const prefix = databasePrefix(base)
    expect(prefix).toBe('app_test_w_')
    expect(deriveWorkerDbName(base, 3).startsWith(prefix)).toBe(true)
    expect('app_test_template'.startsWith(prefix)).toBe(false) // sweep must never drop the template
  })
})
