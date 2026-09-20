import { describe, expect, it } from 'vitest'

import { resolveCloseTarget } from '../close-target'

const origin = 'https://example.test'

describe('resolveCloseTarget', () => {
  it('prefers the page the sheet was opened from, with its query intact', () => {
    // A list keeps its filters and its page. `base` is usually written query-free, so preferring it
    // would drop them.
    expect(
      resolveCloseTarget({
        referer: `${origin}/parent?tab=fees&page=3`,
        base: '/parent',
        requestURL: `${origin}/parent/42/edit`,
        origin,
        held: [],
      }),
    ).toBe('/parent?tab=fees&page=3')
  })

  it('falls back to the declared base when there is no referer', () => {
    expect(
      resolveCloseTarget({ referer: null, base: '/parent', requestURL: `${origin}/parent/42/edit`, origin, held: [] }),
    ).toBe('/parent')
  })

  it('ignores a referer pointing at the sheet itself, which is what a refresh sends', () => {
    expect(
      resolveCloseTarget({
        referer: `${origin}/parent/42/edit`,
        base: '/parent',
        requestURL: `${origin}/parent/42/edit`,
        origin,
        held: [],
      }),
    ).toBe('/parent')
  })

  it('ignores a cross-origin referer', () => {
    expect(
      resolveCloseTarget({
        referer: 'https://elsewhere.test/parent',
        base: '/parent',
        requestURL: `${origin}/parent/42/edit`,
        origin,
        held: [],
      }),
    ).toBe('/parent')
  })

  it('ignores a malformed referer rather than throwing', () => {
    expect(
      resolveCloseTarget({
        referer: 'not a url',
        base: '/parent',
        requestURL: `${origin}/parent/42/edit`,
        origin,
        held: [],
      }),
    ).toBe('/parent')
  })
})

describe('a referer that is itself an open level', () => {
  it('lands on the base rather than on the sheet the student is leaving', () => {
    // The shape that loops: a level opened from a level, whose own base is not open. Nothing is
    // held that matches it, so the client cannot preserve a close target, and the referer is the
    // sheet being left.
    const close = resolveCloseTarget({
      referer: `${origin}/parent/42/edit/history`,
      base: '/parent/42/edit',
      requestURL: `${origin}/parent/42/notes`,
      origin,
      held: ['/parent/42/edit/history'],
    })

    expect(close).toBe('/parent/42/edit')
  })

  it('compares on the path, so a held level with a query still matches', () => {
    const close = resolveCloseTarget({
      referer: `${origin}/parent/42/edit/history?page=2`,
      base: '/parent/42/edit',
      requestURL: `${origin}/parent/42/notes`,
      origin,
      held: ['/parent/42/edit/history?page=7'],
    })

    expect(close).toBe('/parent/42/edit')
  })

  it('keeps two levels sharing a base off each other', () => {
    const close = resolveCloseTarget({
      referer: `${origin}/parent/42/edit`,
      base: '/parent/42',
      requestURL: `${origin}/parent/42/history`,
      origin,
      held: ['/parent/42/edit'],
    })

    expect(close).toBe('/parent/42')
  })
})

describe('a referer that is the open level this one sits over', () => {
  it('keeps it, with the query the level below is showing', () => {
    // The level below is the one place closing is meant to land, and its query is the filter the
    // reader narrowed it to. `base` is declared without one, so refusing the referer here loses it.
    const close = resolveCloseTarget({
      referer: `${origin}/parent/42/edit?filter=open`,
      base: '/parent/42/edit',
      requestURL: `${origin}/parent/42/edit/history`,
      origin,
      held: ['/parent/42/edit?filter=open'],
    })

    expect(close).toBe('/parent/42/edit?filter=open')
  })

  it('still refuses an open referer that is some other level', () => {
    const close = resolveCloseTarget({
      referer: `${origin}/parent/42/notes?filter=open`,
      base: '/parent/42/edit',
      requestURL: `${origin}/parent/42/edit/history`,
      origin,
      held: ['/parent/42/notes?filter=open'],
    })

    expect(close).toBe('/parent/42/edit')
  })

  it('matches the base against the referer on the path, so neither spelling changes the answer', () => {
    const close = resolveCloseTarget({
      referer: `${origin}/parent/42/edit?filter=open`,
      base: '/parent/42/edit/',
      requestURL: `${origin}/parent/42/edit/history`,
      origin,
      held: ['/parent/42/edit'],
    })

    expect(close).toBe('/parent/42/edit?filter=open')
  })

  it('matches the other spelling too, a referer with a trailing slash against a base without one', () => {
    const close = resolveCloseTarget({
      referer: `${origin}/parent/42/edit/?filter=open`,
      base: '/parent/42/edit',
      requestURL: `${origin}/parent/42/edit/history`,
      origin,
      held: ['/parent/42/edit/'],
    })

    expect(close).toBe('/parent/42/edit/?filter=open')
  })
})

describe('a referer that is a page', () => {
  it('is still preferred, and still carries its query', () => {
    // The whole reason the referer is preferred: it is where the student actually is, filters and
    // all, where a base is written query-free. Nothing about this changes.
    const close = resolveCloseTarget({
      referer: `${origin}/parent?filter=open`,
      base: '/parent',
      requestURL: `${origin}/parent/42/edit`,
      origin,
      held: [],
    })

    expect(close).toBe('/parent?filter=open')
  })

  it('is still preferred when other levels are open that it does not name', () => {
    const close = resolveCloseTarget({
      referer: `${origin}/parent?filter=open`,
      base: '/parent',
      requestURL: `${origin}/parent/42/edit`,
      origin,
      held: ['/parent/99/edit'],
    })

    expect(close).toBe('/parent?filter=open')
  })
})

describe('a held url normalised against a referer path', () => {
  it('matches a held url written with a trailing slash against a referer path without one', () => {
    const close = resolveCloseTarget({
      referer: `${origin}/parent/42/edit/history`,
      base: '/parent/42/edit',
      requestURL: `${origin}/parent/42/notes`,
      origin,
      held: ['/parent/42/edit/history/'],
    })

    expect(close).toBe('/parent/42/edit')
  })

  it('matches a held url carrying a fragment against the same referer path', () => {
    const close = resolveCloseTarget({
      referer: `${origin}/parent/42/edit/history`,
      base: '/parent/42/edit',
      requestURL: `${origin}/parent/42/notes`,
      origin,
      held: ['/parent/42/edit/history#top'],
    })

    expect(close).toBe('/parent/42/edit')
  })
})
