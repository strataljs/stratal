// `@inertiajs/react@3` does not export `PageContext` from its public API (`types/index.d.ts` only
// re-exports `usePage`, not the context it reads) — so `usePage()` is mocked directly instead of
// stubbed through a provider. The mock has to read a mutable holder rather than close over a
// per-test constant: `vi.mock` factories are hoisted above the file's own declarations, so anything
// they reference must come from `vi.hoisted`.
const pageState = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('@inertiajs/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@inertiajs/react')>()),
  usePage: () => pageState.current,
}))

import { resetSsrExcludeMatchers } from '@stratal/inertia/services/ssr-exclusion'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModalData } from '../../core/wire'
import { rememberModalComponents } from '../component-registry'
import { Modal } from '../modal'
import { clearHeldStack, holdStack } from '../stack-store'

const Sheet = () => createElement('div', { id: 'sheet' }, 'sheet')
const Beneath = () => createElement('div', { id: 'beneath' }, 'beneath')
const Held = () => createElement('div', { id: 'held' }, 'held')

const level = (url: string, base: string, component: string): ModalData =>
  ({ component, props: {}, url, base, close: base })

function pageWith(props: Record<string, unknown>) {
  return { component: 'Parent/Index', url: '/parent/1/edit', version: '1', props }
}

describe('<Modal /> server rendering', () => {
  beforeEach(() => {
    clearHeldStack()
    rememberModalComponents({ 'Parent/Edit': Sheet, 'Parent/Show': Beneath, 'Held/Sheet': Held })
  })

  it('renders the level a document response carries', () => {
    pageState.current = pageWith({ modal: level('/parent/1/edit', '/parent', 'Parent/Edit') })

    expect(renderToStaticMarkup(createElement(Modal))).toContain('id="sheet"')
  })

  it('renders the chain beneath the level, outermost first', () => {
    pageState.current = pageWith({
      modal: level('/parent/1/child/2', '/parent/1', 'Parent/Edit'),
      modalBeneath: [level('/parent/1', '/parent', 'Parent/Show')],
    })

    const html = renderToStaticMarkup(createElement(Modal))
    expect(html.indexOf('id="beneath"')).toBeLessThan(html.indexOf('id="sheet"'))
  })

  it('renders nothing when no level is open', () => {
    pageState.current = pageWith({})

    expect(renderToStaticMarkup(createElement(Modal))).toBe('')
  })

  it('never lets a held stack reach server markup', () => {
    // A Workers isolate serves many requests, so a module-level stack read during SSR would put one
    // user's open sheets into another user's HTML. `document` is undefined in this suite's `node`
    // environment, exactly as it is on a worker.
    holdStack([level('/held', '/', 'Held/Sheet')])
    pageState.current = pageWith({ modal: level('/parent/1/edit', '/parent', 'Parent/Edit') })

    const html = renderToStaticMarkup(createElement(Modal))
    expect(html).toContain('id="sheet"')
    expect(html).not.toContain('id="held"')
  })

  // A browser resolves an excluded component whether or not the server could, so it IS in the
  // registry by the time this render runs — which is why the level has to be withheld here rather
  // than merely left unresolved.
  describe('a level excluded from SSR', () => {
    afterEach(() => {
      delete (globalThis as { __STRATAL_INERTIA_SSR_EXCLUDE__?: string[] }).__STRATAL_INERTIA_SSR_EXCLUDE__
      resetSsrExcludeMatchers()
    })

    function excluding(...patterns: string[]): void {
      ;(globalThis as { __STRATAL_INERTIA_SSR_EXCLUDE__?: string[] }).__STRATAL_INERTIA_SSR_EXCLUDE__ = patterns
      resetSsrExcludeMatchers()
    }

    it('is left out of the render that hydrates, which matches HTML it was never in', () => {
      excluding('Parent/**')
      pageState.current = pageWith({ modal: level('/parent/1/edit', '/parent', 'Parent/Edit') })

      expect(renderToStaticMarkup(createElement(Modal))).toBe('')
    })

    it('does not withhold a level nothing excluded', () => {
      excluding('Admin/**')
      pageState.current = pageWith({ modal: level('/parent/1/edit', '/parent', 'Parent/Edit') })

      expect(renderToStaticMarkup(createElement(Modal))).toContain('id="sheet"')
    })
  })

  it('refuses a payload of a shape this build cannot read rather than rendering it', () => {
    // A tab open across a deploy holds a page from the previous build.
    pageState.current = pageWith({ modal: { levels: {}, order: [] } })

    expect(renderToStaticMarkup(createElement(Modal))).toBe('')
  })
})
