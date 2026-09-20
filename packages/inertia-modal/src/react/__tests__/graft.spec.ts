import type { Page, ScrollProp } from '@inertiajs/core'
import { afterEach, describe, expect, it } from 'vitest'

import type { ModalData } from '../../core/wire'
import { dropDismissedLevels, graftOnto } from '../graft'
import { clearHeldStack, holdStack } from '../stack-store'

const level: ModalData = {
  component: 'Parent/Edit',
  props: { title: 'Edit' },
  url: '/parent/1/edit',
  base: '/parent',
  close: '/parent',
}

function page(props: Record<string, unknown>, component = 'Parent/Index'): Page {
  return {
    component,
    props: { errors: {}, ...props },
    url: '/parent',
    version: null,
    flash: {},
    rememberedState: {},
    rescuedProps: [],
  }
}

function scrollProp(): ScrollProp {
  return { pageName: 'page', previousPage: null, nextPage: 2, currentPage: 1, reset: false }
}

describe('graftOnto', () => {
  it('takes the mounted component, so Inertia merges rather than replaces', () => {
    // A response whose component differs from the mounted one makes Inertia discard every prop the
    // page holds — the page behind the sheet would go blank.
    const incoming = page({ modal: level }, 'Parent/Edit')

    graftOnto(incoming, page({ items: ['a'] }))

    expect(incoming.component).toBe('Parent/Index')
  })

  it('keeps the props the mounted page holds', () => {
    const incoming = page({ modal: level }, 'Parent/Edit')

    graftOnto(incoming, page({ items: ['a'] }))

    expect(incoming.props.items).toEqual(['a'])
    expect(incoming.props.modal).toEqual(level)
  })

  it('leaves the mounted page untouched', () => {
    // The mounted props are copied one level deep, never cloned: a clone walks the whole background
    // payload on every sheet open. Copying still has to mean the mounted page is not written to.
    const mounted = page({ items: ['a'] })
    const incoming = page({ modal: level }, 'Parent/Edit')

    graftOnto(incoming, mounted)

    expect(mounted.props.modal).toBeUndefined()
    expect(mounted.component).toBe('Parent/Index')
  })

  it('drops a chain the mounted page was seeded with', () => {
    // `modalBeneath` only ever arrives on a document response. Carried forward it would re-seed the
    // stack from a snapshot taken before anything was opened or closed.
    const incoming = page({ modal: level }, 'Parent/Edit')

    graftOnto(incoming, page({ modalBeneath: [level] }))

    expect(incoming.props.modalBeneath).toBeUndefined()
  })

  it('keeps the page\'s own scroll metadata alongside the level\'s', () => {
    const incoming = page({ modal: level }, 'Parent/Edit')
    incoming.scrollProps = { 'modal.props.items': scrollProp() }

    const mounted = page({})
    mounted.scrollProps = { rows: scrollProp() }

    graftOnto(incoming, mounted)

    expect(Object.keys(incoming.scrollProps ?? {}).sort()).toEqual(['modal.props.items', 'rows'])
  })
})

describe('dropDismissedLevels', () => {
  afterEach(() => clearHeldStack())

  it('empties a level a landing dismissed, so a merge cannot bring it back', () => {
    // Landing on the page beneath is a visit like any other, and one that names props is merged
    // over what the page holds. A level left in those props is a sheet nothing can close: it is
    // drawn again from the very response that dismissed it.
    holdStack([level])
    const landing = page({ items: ['a'] })

    dropDismissedLevels(landing, false)

    expect(landing.props.modal).toBeNull()
  })

  it('empties the chain beneath along with it', () => {
    // The chain is read whenever nothing is open, which is what a landing makes true. Left behind,
    // it re-seeds the next sheet opened with a stack that was dismissed with the rest.
    holdStack([level])
    const landing = page({ modalBeneath: [level] })

    dropDismissedLevels(landing, false)

    expect(landing.props.modalBeneath).toBeNull()
  })

  it('leaves the level a modal response carries', () => {
    holdStack([level])
    const response = page({ modal: level })

    dropDismissedLevels(response, true)

    expect(response.props.modal).toEqual(level)
  })

  it('leaves a landing alone when nothing is open', () => {
    const landing = page({ items: ['a'] })

    dropDismissedLevels(landing, false)

    expect(landing.props.modal).toBeUndefined()
  })
})
