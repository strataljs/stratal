import { describe, expect, it } from 'vitest'

import { levelPath, samePath } from '../level-path'

describe('levelPath', () => {
  it('drops the query, because that is what a level is showing', () => {
    expect(levelPath('/parent/1/edit?tab=fees')).toBe('/parent/1/edit')
  })

  it('drops the fragment, which is a position within the level', () => {
    expect(levelPath('/parent/1/edit#notes')).toBe('/parent/1/edit')
  })

  it('drops a fragment written after the query, and one written before it', () => {
    expect(levelPath('/parent/1/edit?tab=fees#notes')).toBe('/parent/1/edit')
    expect(levelPath('/parent/1/edit#notes?tab=fees')).toBe('/parent/1/edit')
  })

  it('drops a trailing slash, so an app that appends one names the same level', () => {
    expect(levelPath('/parent/1/edit/')).toBe('/parent/1/edit')
    expect(levelPath('/parent/1/edit/?tab=fees')).toBe('/parent/1/edit')
  })

  it('keeps the root, whose slash is the whole path rather than a trailing one', () => {
    expect(levelPath('/')).toBe('/')
    expect(levelPath('/?tab=fees')).toBe('/')
  })
})

describe('samePath', () => {
  it('is the same across a refined query, because that is the same sheet', () => {
    // What React is keyed by. `refresh({ tab: 'fees' })` asks to preserve state and answers on the
    // same path with a new query — keyed by the whole url, that is a new key, and React answers a
    // new key by unmounting the subtree and discarding exactly what was asked to be kept.
    expect(samePath('/parent/1/edit?tab=fees', '/parent/1/edit?tab=notes')).toBe(true)
    expect(samePath('/parent/1/edit?tab=fees', '/parent/1/edit')).toBe(true)
  })

  it('matches a trailing slash on one side only', () => {
    expect(samePath('/parent/1/edit', '/parent/1/edit/')).toBe(true)
    expect(samePath('/parent/1/edit/', '/parent/1/edit')).toBe(true)
  })

  it('matches a level carrying a fragment against its own url', () => {
    expect(samePath('/parent/1/edit#notes', '/parent/1/edit')).toBe(true)
  })

  it('matches across a fragment and a query at once', () => {
    expect(samePath('/parent/1/edit/?tab=fees#notes', '/parent/1/edit')).toBe(true)
  })

  it('differs for a different level', () => {
    expect(samePath('/parent/1/edit', '/parent/2/edit')).toBe(false)
  })
})
