// `data` is a prop path Inertia resolves against the page object, and it never reaches the DOM — so
// the mock captures what `Deferred` hands the Inertia component rather than asserting on markup.
const captured = vi.hoisted(() => ({ data: null as string | string[] | null }))

vi.mock('@inertiajs/react', () => ({
  Deferred: ({ children, data }: { children?: unknown; data: string | string[] }) => {
    captured.data = data
    return createElement('div', null, children as never)
  },
}))

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModalData } from '../../core/wire'
import { Deferred } from '../deferred'
import { ModalLevelContext } from '../modal-context'

const level: ModalData = {
  component: 'Parent/Edit',
  props: {},
  url: '/parent/1/edit',
  base: '/parent',
  close: '/parent',
}

function render(data: string | string[], inModal: boolean): void {
  const deferred = createElement(Deferred, { data, fallback: null, children: 'body' })

  renderToStaticMarkup(
    inModal
      ? createElement(
          ModalLevelContext.Provider,
          { value: { modal: level, depth: 0, isTop: true } },
          deferred,
        )
      : deferred,
  )
}

describe('Deferred', () => {
  beforeEach(() => { captured.data = null })

  it('leaves the name alone outside a modal, where it is already the path', () => {
    // The level context defaults to `null` rather than `undefined`, so a presence check written
    // against the wrong absent value nests the path on every page that is not a sheet.
    render('entries', false)

    expect(captured.data).toBe('entries')
  })

  it('nests the name under the level inside a modal', () => {
    render('entries', true)

    expect(captured.data).toBe('modal.props.entries')
  })

  it('nests every name when several are deferred together', () => {
    render(['entries', 'total'], true)

    expect(captured.data).toEqual(['modal.props.entries', 'modal.props.total'])
  })
})
