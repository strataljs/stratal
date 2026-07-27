import { afterEach, describe, expect, it } from 'vitest'
import {
  SSR_EXCLUDE_GLOBAL,
  compileSsrExcludePatterns,
  getSsrExcludeMatchers,
  isSsrExcluded,
  readSsrExcludePatterns,
  resetSsrExcludeMatchers,
} from '../services/ssr-exclusion'

function match(pattern: string, component: string): boolean {
  return isSsrExcluded(component, compileSsrExcludePatterns([pattern]))
}

describe('compileSsrExcludePatterns / isSsrExcluded', () => {
  it('matches an exact component name', () => {
    expect(match('Reports/Heavy', 'Reports/Heavy')).toBe(true)
    expect(match('Reports/Heavy', 'Reports/Light')).toBe(false)
  })

  it('treats `*` as a single segment (does not cross `/`)', () => {
    expect(match('Admin/*', 'Admin/Dashboard')).toBe(true)
    expect(match('Admin/*', 'Admin/Users/Edit')).toBe(false)
    expect(match('Admin/*', 'Admin')).toBe(false)
  })

  it('treats `**` as any number of segments', () => {
    expect(match('Admin/**', 'Admin/Dashboard')).toBe(true)
    expect(match('Admin/**', 'Admin/Users/Edit')).toBe(true)
    expect(match('Admin/**', 'Public/Home')).toBe(false)
  })

  it('anchors the pattern so partial names do not match', () => {
    expect(match('Admin', 'AdminPanel')).toBe(false)
    expect(match('Admin', 'Admin')).toBe(true)
  })

  it('escapes `?` so it matches literally instead of acting as a quantifier', () => {
    expect(match('a?b', 'a?b')).toBe(true)
    expect(match('a?b', 'ab')).toBe(false)
  })

  it('returns false when no matchers are supplied', () => {
    expect(isSsrExcluded('Anything', [])).toBe(false)
  })

  it('matches against any matcher in the set', () => {
    const matchers = compileSsrExcludePatterns(['Admin/**', 'Reports/Heavy'])
    expect(isSsrExcluded('Reports/Heavy', matchers)).toBe(true)
    expect(isSsrExcluded('Admin/Settings', matchers)).toBe(true)
    expect(isSsrExcluded('Home', matchers)).toBe(false)
  })
})

describe('readSsrExcludePatterns', () => {
  afterEach(() => {
    ;(globalThis as Record<string, unknown>)[SSR_EXCLUDE_GLOBAL] = undefined
  })

  it('returns an empty list when the global is unset', () => {
    expect(readSsrExcludePatterns()).toEqual([])
  })

  it('reads the glob list injected by the Vite plugin', () => {
    ;(globalThis as Record<string, unknown>)[SSR_EXCLUDE_GLOBAL] = ['Admin/**']
    expect(readSsrExcludePatterns()).toEqual(['Admin/**'])
  })
})

describe('getSsrExcludeMatchers', () => {
  afterEach(() => {
    ;(globalThis as Record<string, unknown>)[SSR_EXCLUDE_GLOBAL] = undefined
    resetSsrExcludeMatchers()
  })

  it('memoizes the matchers so the static pattern list is compiled once', () => {
    ;(globalThis as Record<string, unknown>)[SSR_EXCLUDE_GLOBAL] = ['Admin/**']
    resetSsrExcludeMatchers()

    const first = getSsrExcludeMatchers()
    expect(isSsrExcluded('Admin/Dashboard', first)).toBe(true)

    // A later global change is ignored until the memo is reset — proving the
    // compile happens once rather than per call (and per request).
    ;(globalThis as Record<string, unknown>)[SSR_EXCLUDE_GLOBAL] = ['Reports/**']
    expect(getSsrExcludeMatchers()).toBe(first)

    resetSsrExcludeMatchers()
    expect(isSsrExcluded('Admin/Dashboard', getSsrExcludeMatchers())).toBe(false)
  })
})
