import { describe, expect, it } from 'vitest'
import { shouldLoopback } from '../cached-entrypoint'

describe('shouldLoopback', () => {
  it('loops back a GET on a cacheable route', () => {
    expect(shouldLoopback('GET', { ttl: 300 })).toBe(true)
  })

  it('loops back a HEAD on a cacheable route', () => {
    expect(shouldLoopback('HEAD', { ttl: 300 })).toBe(true)
  })

  it('runs a POST inline even on a cacheable route', () => {
    expect(shouldLoopback('POST', { ttl: 300 })).toBe(false)
  })

  it('runs a GET inline when the route is not cacheable', () => {
    expect(shouldLoopback('GET', undefined)).toBe(false)
  })

  it('runs PUT, PATCH, and DELETE inline', () => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      expect(shouldLoopback(method, { ttl: 300 })).toBe(false)
    }
  })
})
