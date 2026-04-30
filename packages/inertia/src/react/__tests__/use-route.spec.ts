import { describe, expect, it } from 'vitest'
import { applyTrailingSlash, matchPath } from '../use-route'

describe('applyTrailingSlash', () => {
  describe("'ignore'", () => {
    it('returns url as-is', () => {
      expect(applyTrailingSlash('/users', 'ignore')).toBe('/users')
      expect(applyTrailingSlash('/users/', 'ignore')).toBe('/users/')
      expect(applyTrailingSlash('/users?page=2', 'ignore')).toBe('/users?page=2')
    })
  })

  describe("'always'", () => {
    it('appends trailing slash to a relative path', () => {
      expect(applyTrailingSlash('/users', 'always')).toBe('/users/')
    })

    it('keeps trailing slash before query string', () => {
      expect(applyTrailingSlash('/users?page=2', 'always')).toBe('/users/?page=2')
    })

    it('keeps trailing slash before hash', () => {
      expect(applyTrailingSlash('/users#top', 'always')).toBe('/users/#top')
    })

    it('canonicalises absolute URLs (domain routes)', () => {
      expect(applyTrailingSlash('https://acme.app.com/dashboard', 'always'))
        .toBe('https://acme.app.com/dashboard/')
    })

    it('skips file-like paths (last segment with `.`)', () => {
      expect(applyTrailingSlash('/file.json', 'always')).toBe('/file.json')
      expect(applyTrailingSlash('/api/openapi.json', 'always')).toBe('/api/openapi.json')
    })

    it('skips the root path', () => {
      expect(applyTrailingSlash('/', 'always')).toBe('/')
    })

    it('leaves an already-trailing path unchanged', () => {
      expect(applyTrailingSlash('/users/', 'always')).toBe('/users/')
    })
  })

  describe("'never'", () => {
    it('strips a trailing slash from a relative path', () => {
      expect(applyTrailingSlash('/users/', 'never')).toBe('/users')
    })

    it('preserves query string', () => {
      expect(applyTrailingSlash('/users/?page=2', 'never')).toBe('/users?page=2')
    })

    it('canonicalises absolute URLs', () => {
      expect(applyTrailingSlash('https://acme.app.com/dashboard/', 'never'))
        .toBe('https://acme.app.com/dashboard')
    })

    it('skips the root path', () => {
      expect(applyTrailingSlash('/', 'never')).toBe('/')
    })

    it('leaves a non-trailing path unchanged', () => {
      expect(applyTrailingSlash('/users', 'never')).toBe('/users')
    })
  })
})

describe('matchPath', () => {
  it('matches a literal pathname', () => {
    expect(matchPath('/users', '/users')).toBe(true)
  })

  it('matches `:param` placeholders', () => {
    expect(matchPath('/users/:id', '/users/42')).toBe(true)
  })

  it('matches `:param{constraint}` placeholders', () => {
    expect(matchPath('/:locale{en|fr}/posts', '/fr/posts')).toBe(true)
  })

  it('returns false for a non-matching path', () => {
    expect(matchPath('/users/:id', '/posts/42')).toBe(false)
  })

  it('tolerates a trailing slash on the route side', () => {
    expect(matchPath('/users/:id/', '/users/42')).toBe(true)
  })

  it('tolerates a trailing slash on the pathname side', () => {
    expect(matchPath('/users/:id', '/users/42/')).toBe(true)
  })

  it('still matches root', () => {
    expect(matchPath('/', '/')).toBe(true)
  })
})
