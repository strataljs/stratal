// `refresh()` re-reads the open level, and the caller has to be able to tell when it landed.
//
// Without options of its own, timing a refresh means subscribing to the router's `finish` event —
// which fires for every visit in flight, a background poll included. A one-shot listener taken
// around a refresh then stops on whichever visit finishes first, and the refresh it was timing
// completes unobserved.
const routerMock = vi.hoisted(() => ({ get: vi.fn(), visit: vi.fn(), reload: vi.fn() }))

vi.mock('@inertiajs/react', () => ({ router: routerMock }))

import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModalData } from '../../core/wire'
import { ModalLevelContext, ModalStackContext } from '../modal-context'
import { useModal } from '../use-modal'

const level: ModalData = {
  component: 'Parent/Edit',
  props: {},
  url: '/parent/42/edit?tab=fees',
  base: '/parent',
  close: '/parent',
}

/** Renders the hook inside an open level and hands its return to `run`. */
function withModal(run: (modal: ReturnType<typeof useModal>) => void): void {
  function Probe(): ReactNode {
    run(useModal())
    return null
  }

  renderToStaticMarkup(
    createElement(
      ModalStackContext.Provider,
      { value: [level] },
      createElement(
        ModalLevelContext.Provider,
        { value: { modal: level, depth: 0, isTop: true } },
        createElement(Probe)
      )
    )
  )
}

describe('useModal().refresh', () => {
  beforeEach(() => routerMock.get.mockClear())

  it('re-reads this level at its own url, under the query it is given', () => {
    withModal((modal) => modal.refresh({ coupon: 'STUDENT10' }))

    expect(routerMock.get).toHaveBeenCalledWith(
      level.url,
      { coupon: 'STUDENT10' },
      expect.objectContaining({ preserveState: true, preserveScroll: true, replace: true })
    )
  })

  it('carries the visit options it is given, so the caller can time its own visit', () => {
    const onFinish = vi.fn()
    withModal((modal) => modal.refresh({ coupon: 'STUDENT10' }, { onFinish }))

    expect(routerMock.get).toHaveBeenCalledWith(
      level.url,
      { coupon: 'STUDENT10' },
      expect.objectContaining({ onFinish })
    )
  })

  it('lets a caller override the defaults it sets', () => {
    withModal((modal) => modal.refresh(undefined, { preserveScroll: false }))

    const options = routerMock.get.mock.calls[0]?.[2] as Record<string, unknown>
    expect(options.preserveScroll).toBe(false)
    expect(options.preserveState).toBe(true)
  })
})

describe('useModal().reload', () => {
  beforeEach(() => routerMock.reload.mockClear())

  it('anchors the props it names to the level they belong to', () => {
    withModal((modal) => modal.reload({ only: ['items'], except: ['title'], reset: ['rows'] }))

    expect(routerMock.reload).toHaveBeenCalledWith(
      expect.objectContaining({
        only: ['modal.props.items'],
        except: ['modal.props.title'],
        reset: ['modal.props.rows'],
      })
    )
  })

  it('passes everything that does not name a prop straight through', () => {
    const onFinish = vi.fn()
    withModal((modal) => modal.reload({ only: ['items'], onFinish, headers: { 'x-a': 'b' } }))

    expect(routerMock.reload).toHaveBeenCalledWith(
      expect.objectContaining({ onFinish, headers: { 'x-a': 'b' } })
    )
  })

  it('names no props when it was given none, rather than asking for none', () => {
    // `only: undefined` in the options would read as a request for nothing at all.
    withModal((modal) => modal.reload({ onFinish: vi.fn() }))

    const options = routerMock.reload.mock.calls[0]?.[0] as Record<string, unknown>
    expect('only' in options).toBe(false)
    expect('except' in options).toBe(false)
    expect('reset' in options).toBe(false)
  })
})

describe('useModal().close', () => {
  beforeEach(() => routerMock.visit.mockClear())

  it('lands where the level was opened from, preserving what a sheet must not lose', () => {
    withModal((modal) => modal.close())

    expect(routerMock.visit).toHaveBeenCalledWith(
      level.close,
      expect.objectContaining({ replace: true, preserveScroll: true, preserveState: true })
    )
  })

  it('carries the visit options it is given, so a caller can act once it has landed', () => {
    const onFinish = vi.fn()
    withModal((modal) => modal.close({ onFinish }))

    expect(routerMock.visit).toHaveBeenCalledWith(level.close, expect.objectContaining({ onFinish }))
  })
})

describe('useModal().closeAll', () => {
  beforeEach(() => routerMock.visit.mockClear())

  it('lands where the outermost level was opened from', () => {
    withModal((modal) => modal.closeAll())

    expect(routerMock.visit).toHaveBeenCalledWith(
      level.close,
      expect.objectContaining({ replace: true, preserveScroll: true, preserveState: true })
    )
  })

  it('carries the visit options it is given, without dropping the defaults', () => {
    const onFinish = vi.fn()
    withModal((modal) => modal.closeAll({ onFinish }))

    expect(routerMock.visit).toHaveBeenCalledWith(
      level.close,
      expect.objectContaining({ onFinish, replace: true, preserveScroll: true, preserveState: true })
    )
  })
})
