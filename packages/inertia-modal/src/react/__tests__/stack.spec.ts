import { describe, expect, it } from 'vitest'

import { levelPath } from '../../core/level-path'
import type { ModalData } from '../../core/wire'
import { applyStack } from '../stack'

const level = (url: string, base: string): ModalData => ({
  component: 'Parent/Edit',
  props: {},
  url,
  base,
  close: base,
})

describe('applyStack', () => {
  it('pushes a level whose base is the one already open', () => {
    const parent = level('/parent/1/edit', '/parent')
    const child = level('/parent/1/child/2', '/parent/1/edit')
    expect(applyStack([parent], child, null)).toEqual([parent, child])
  })

  it('replaces a level addressed by its own url rather than stacking on itself', () => {
    // A refined re-read — a filter, a coupon, a page — is the same level, not a new one.
    const first = level('/parent/1/edit', '/parent')
    const refined = { ...level('/parent/1/edit?tab=fees', '/parent'), props: { tab: 'fees' } }
    expect(applyStack([first], refined, null)).toEqual([refined])
  })

  it('merges a narrowed answer over the props the level already holds', () => {
    // A targeted reload sends back only what it asked for. Replacing the props outright would take
    // the rest of the sheet away.
    const held = { ...level('/parent/1/edit', '/parent'), props: { title: 'Edit', items: ['a'] } }
    const narrowed = { ...level('/parent/1/edit', '/parent'), props: { items: ['a', 'b'] } }

    expect(applyStack([held], narrowed, null)[0]?.props).toEqual({ title: 'Edit', items: ['a', 'b'] })
  })

  it('keeps where a level closes to when the level above closes onto it', () => {
    // Closing the child lands here by visiting this level's url, and the server derives that
    // response's `close` from the Referer — the child that just closed. Taking it would aim the
    // parent back at the child, and the two would close onto each other forever.
    const parent = level('/parent/1/edit', '/parent')
    const child = level('/parent/1/child/2', '/parent/1/edit')
    const answered = { ...level('/parent/1/edit', '/parent'), close: '/parent/1/child/2' }

    const result = applyStack([parent, child], answered, null)

    expect(result).toHaveLength(1)
    expect(result[0]?.close).toBe('/parent')
  })

  it('answers a level addressed with a trailing slash as the level already open', () => {
    // One route, two spellings. An app that appends a trailing slash emits both, and a level that
    // does not recognise its other spelling is answered as a new one — losing the props it holds
    // and the target it closes onto.
    const beneath = level('/parent', '/')
    const held = { ...level('/parent/42/edit', '/parent'), props: { title: 'Edit', items: ['a'] } }
    const again = { ...level('/parent/42/edit/', '/parent'), props: { items: ['a', 'b'] }, close: '/parent/42' }

    const result = applyStack([beneath, held], again, null)

    expect(result).toHaveLength(2)
    expect(result[1]?.props).toEqual({ title: 'Edit', items: ['a', 'b'] })
    expect(result[1]?.close).toBe('/parent')
  })

  it('starts a fresh stack when the incoming base is not what is open', () => {
    const open = level('/parent/1/edit', '/parent')
    const unrelated = level('/other/9/edit', '/other')
    expect(applyStack([open], unrelated, null)).toEqual([unrelated])
  })

  it('keeps an open level when a later response still carries the document\'s chain', () => {
    // `modalBeneath` travels in props, and Inertia merges a partial response onto the props the
    // page holds — so the document's chain is still there on every response after it. Seating the
    // level on that chain again would drop what the open one holds, which is everything the
    // narrowed response did not name.
    const beneath = [level('/parent', '/')]
    const held = { ...level('/parent/1/edit', '/parent'), props: { title: 'Edit', items: ['a'] } }
    const narrowed = { ...level('/parent/1/edit', '/parent'), props: { items: ['a', 'b'] } }

    const result = applyStack([...beneath, held], narrowed, beneath)

    expect(result).toHaveLength(2)
    expect(result[1]?.props).toEqual({ title: 'Edit', items: ['a', 'b'] })
  })

  it('seeds the whole chain from a document response', () => {
    const beneath = [level('/parent/1/edit', '/parent')]
    const top = level('/parent/1/child/2', '/parent/1/edit')
    expect(applyStack([], top, beneath)).toEqual([...beneath, top])
  })

  it('clears the stack when a response carries no modal', () => {
    expect(applyStack([level('/parent/1/edit', '/parent')], null, null)).toEqual([])
  })

  it('drops everything above the level a response addresses', () => {
    // Closing a child lands on its parent's url. The child has to go with it, or it stays drawn
    // over a level that has already moved on.
    const parent = level('/parent/1/edit', '/parent')
    const child = level('/parent/1/child/2', '/parent/1/edit')
    expect(applyStack([parent, child], parent, null)).toEqual([parent])
  })
})

describe('the key a level renders under', () => {
  it('survives the merge a refined query goes through', () => {
    // The identity has to hold through `applyStack`, which takes the incoming url so the level's
    // address follows the query. Composing the two is what the rendered key actually does.
    const held = level('/parent/1/edit?tab=fees', '/parent')
    const [merged] = applyStack([held], level('/parent/1/edit?tab=notes', '/parent'), null)

    expect(merged.url).toBe('/parent/1/edit?tab=notes')
    expect(levelPath(merged.url)).toBe(levelPath(held.url))
  })
})
