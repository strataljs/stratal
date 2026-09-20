// The visit options are what this component exists to carry, and they never reach the DOM — so the
// mock captures the props `ModalLink` hands to `Link` rather than asserting on rendered markup.
const captured = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }))

vi.mock('@inertiajs/react', () => ({
  Link: ({ children, ...props }: { children?: unknown } & Record<string, unknown>) => {
    captured.props = props
    return createElement('a', { href: String(props.href) }, children as never)
  },
}))

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ModalLink } from '../modal-link'

function open(props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(createElement(ModalLink, { href: '/parent/1/edit', ...props }, 'Edit'))
}

describe('ModalLink', () => {
  beforeEach(() => { captured.props = null })

  it('asks only for the modal, so the page beneath is not re-sent', () => {
    open()

    expect(captured.props?.only).toEqual(['modal'])
  })

  it('keeps the page it opens over mounted, and where the reader had scrolled to', () => {
    // A sheet that remounts the list behind it, or jumps it to the top, loses the reader's place
    // when it closes.
    open()

    expect(captured.props?.preserveState).toBe(true)
    expect(captured.props?.preserveScroll).toBe(true)
  })

  it('lets a caller override what it sets', () => {
    open({ preserveScroll: false })

    expect(captured.props?.preserveScroll).toBe(false)
  })

  it('renders a real link, so a sheet is still openable in a new tab', () => {
    expect(open()).toContain('href="/parent/1/edit"')
  })
})
