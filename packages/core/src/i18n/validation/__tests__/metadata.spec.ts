import { describe as describeTest, expect, it } from 'vitest'
import { globalRegistry, object, string } from 'zod/mini'
import { describe, named } from '../metadata'

describeTest('describe', () => {
  it('registers a bare description string', () => {
    const schema = describe(string(), 'The display name')
    expect(globalRegistry.get(schema)).toEqual({ description: 'The display name' })
  })

  it('passes through a full metadata object', () => {
    const schema = describe(string(), { description: 'The id', example: '1212121', deprecated: true })
    expect(globalRegistry.get(schema)).toMatchObject({ description: 'The id', example: '1212121', deprecated: true })
  })

  it('returns the same schema instance for chaining', () => {
    const base = string()
    expect(describe(base, 'x')).toBe(base)
  })
})

describeTest('named', () => {
  it('registers id only when no metadata is given', () => {
    const schema = named(object({ id: string() }), 'User')
    expect(globalRegistry.get(schema)).toEqual({ id: 'User' })
  })

  it('registers id with a description string', () => {
    const schema = named(object({ id: string() }), 'User', 'A user record')
    expect(globalRegistry.get(schema)).toEqual({ id: 'User', description: 'A user record' })
  })

  it('merges a metadata object and keeps the explicit id authoritative', () => {
    const schema = named(object({ id: string() }), 'Money', { id: 'ignored', example: { cents: 500 } })
    expect(globalRegistry.get(schema)).toEqual({ id: 'Money', example: { cents: 500 } })
  })
})
