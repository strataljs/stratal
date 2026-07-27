import { describe, expect, it } from 'vitest'
import { Cacheable, PurgesCache, getCacheable, getPurgesCache } from '../decorators'
import { ResponseCacheConfigError } from '../errors'

class Controller {
  @Cacheable({ ttl: 300, tags: ['post-list'] })
  index(): void {
    //
  }

  @Cacheable()
  bare(): void {
    //
  }

  @PurgesCache({ tags: ['post:{param.slug}'] })
  publish(): void {
    //
  }

  plain(): void {
    //
  }
}

describe('@Cacheable', () => {
  it('records the options against the method', () => {
    expect(getCacheable(Controller.prototype, 'index')).toEqual({ ttl: 300, tags: ['post-list'] })
  })

  it('records an empty config for a bare decorator', () => {
    expect(getCacheable(Controller.prototype, 'bare')).toEqual({})
  })

  it('returns undefined for an undecorated method', () => {
    expect(getCacheable(Controller.prototype, 'plain')).toBeUndefined()
  })
})

describe('@PurgesCache', () => {
  it('records the options against the method', () => {
    expect(getPurgesCache(Controller.prototype, 'publish')).toEqual({ tags: ['post:{param.slug}'] })
  })

  it('returns undefined for an undecorated method', () => {
    expect(getPurgesCache(Controller.prototype, 'plain')).toBeUndefined()
  })

  it('rejects purgeEverything combined with tags', () => {
    expect(() => {
      class Bad {
        @PurgesCache({ purgeEverything: true, tags: ['x'] })
        method(): void {
          //
        }
      }
      return Bad
    }).toThrow(ResponseCacheConfigError)
  })

  it('rejects purgeEverything combined with pathPrefixes', () => {
    expect(() => {
      class Bad {
        @PurgesCache({ purgeEverything: true, pathPrefixes: ['/x'] })
        method(): void {
          //
        }
      }
      return Bad
    }).toThrow(ResponseCacheConfigError)
  })

  it('rejects an empty purge spec', () => {
    expect(() => {
      class Bad {
        @PurgesCache({})
        method(): void {
          //
        }
      }
      return Bad
    }).toThrow(ResponseCacheConfigError)
  })
})
