import { describe, expect, it } from 'vitest'

import {
  decodeHeldLevels,
  encodeHeldLevels,
  isModalData,
  isModalPropPath,
  MODAL_DOCUMENT_HEADER,
  MODAL_HELD_HEADER,
  MODAL_MARKER_HEADER,
  modalPropPath,
} from '../wire'

describe('modalPropPath', () => {
  it('addresses a level prop without a key, because a response carries one modal', () => {
    expect(modalPropPath('items')).toBe('modal.props.items')
  })
})

describe('isModalPropPath', () => {
  it('accepts the modal prop itself and paths into it', () => {
    expect(isModalPropPath('modal')).toBe(true)
    expect(isModalPropPath('modal.props.items')).toBe(true)
  })

  it('rejects a page prop that merely starts with the same letters', () => {
    expect(isModalPropPath('modalities')).toBe(false)
  })

  it('rejects an unrelated page prop', () => {
    expect(isModalPropPath('unreadCount')).toBe(false)
  })
})

describe('header names', () => {
  it('are lowercase, so a case-sensitive header lookup matches', () => {
    expect(MODAL_MARKER_HEADER).toBe(MODAL_MARKER_HEADER.toLowerCase())
    expect(MODAL_DOCUMENT_HEADER).toBe(MODAL_DOCUMENT_HEADER.toLowerCase())
  })

  it('sit outside the x-inertia namespace, which Inertia still adds to', () => {
    expect(MODAL_MARKER_HEADER.startsWith('x-inertia')).toBe(false)
    expect(MODAL_DOCUMENT_HEADER.startsWith('x-inertia')).toBe(false)
  })
})

describe('isModalData', () => {
  it('accepts a complete level', () => {
    expect(
      isModalData({ component: 'Parent/Edit', props: {}, url: '/parent/1/edit', base: '/parent', close: '/parent' }),
    ).toBe(true)
  })

  it('rejects a payload from an older build rather than rendering it', () => {
    expect(isModalData({ levels: {}, order: [] })).toBe(false)
    expect(isModalData(null)).toBe(false)
  })
})

describe('the held-levels header', () => {
  it('sits outside the x-inertia namespace, which Inertia is still adding to', () => {
    expect(MODAL_HELD_HEADER).toBe('stratal-modal-held')
  })

  it('carries a url with a query, which a header value cannot hold raw', () => {
    const header = encodeHeldLevels(['/parent/42/edit?tab=history'])

    expect(header).not.toContain('?')
    expect(decodeHeldLevels(header)).toEqual(['/parent/42/edit?tab=history'])
  })

  it('carries several levels, outermost first', () => {
    const urls = ['/parent/42/edit', '/parent/42/edit/history?page=2']

    expect(decodeHeldLevels(encodeHeldLevels(urls))).toEqual(urls)
  })

  it('reads a missing header as nothing held, not as an error', () => {
    expect(decodeHeldLevels(null)).toEqual([])
    expect(decodeHeldLevels('')).toEqual([])
  })

  it('reads a header this build cannot parse as nothing held', () => {
    // A tab open across a deploy can send an older shape. Refusing it falls back to the referer,
    // which is the behaviour without the header at all.
    expect(decodeHeldLevels('%%%not-encoded%%%')).toEqual([])
  })
})
