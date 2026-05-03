import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { getRateLimits, RateLimit } from '../decorators/rate-limit.decorator'

describe('@RateLimit decorator', () => {
  it('attaches a single name to a class', () => {
    @RateLimit('api')
    class Api {}

    expect(getRateLimits(Api)).toEqual(['api'])
  })

  it('stacks multiple decorators on the same class in evaluation order', () => {
    @RateLimit('inner')
    @RateLimit('outer')
    class Stacked {}

    // Decorators evaluate bottom-up, so 'outer' runs first.
    expect(getRateLimits(Stacked)).toEqual(['outer', 'inner'])
  })

  it('attaches names to a method independent of the class', () => {
    class C {
      @RateLimit('writes')
      create() { /* */ }

      list() { /* */ }
    }

    expect(getRateLimits(C)).toEqual([])
    expect(getRateLimits(C.prototype, 'create')).toEqual(['writes'])
    expect(getRateLimits(C.prototype, 'list')).toEqual([])
  })

  it('class-level + method-level metadata coexist', () => {
    @RateLimit('api')
    class C {
      @RateLimit('writes')
      create() { /* */ }
    }

    expect(getRateLimits(C)).toEqual(['api'])
    expect(getRateLimits(C.prototype, 'create')).toEqual(['writes'])
  })

  it('returns [] for undecorated targets', () => {
    class Bare {
      hello() { /* */ }
    }
    expect(getRateLimits(Bare)).toEqual([])
    expect(getRateLimits(Bare.prototype, 'hello')).toEqual([])
  })
})
