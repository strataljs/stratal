// `document` is what tells this module which runtime it is in, and this suite runs in Node — so a
// browser is simulated by defining it, which is the only thing the code under test asks about.
import type { Page } from '@inertiajs/core'
import { resetSsrExcludeMatchers } from '@stratal/inertia/services/ssr-exclusion'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ModalData } from '../../core/wire'
import { readModalComponents } from '../component-registry'
import { resetModalState } from '../reset'
import { withModals } from '../resolver'

const Component = () => null

const level = (component: string): ModalData =>
  ({ component, props: {}, url: '/parent/1/edit', base: '/parent', close: '/parent' })

function pageWith(...levels: ModalData[]): Page {
  const [top, ...beneath] = levels
  return {
    component: 'Parent/Index',
    url: '/parent/1/edit',
    version: '1',
    props: { modal: top, ...(beneath.length > 0 && { modalBeneath: beneath }) },
  } as unknown as Page
}

/** Every name the wrapped resolver was asked for, in order. */
let asked: string[]

function resolver() {
  asked = []
  return withModals((name: string) => {
    asked.push(name)
    return Component
  })
}

function excluding(...patterns: string[]): void {
  ;(globalThis as { __STRATAL_INERTIA_SSR_EXCLUDE__?: string[] }).__STRATAL_INERTIA_SSR_EXCLUDE__ = patterns
  resetSsrExcludeMatchers()
}

function inBrowser(): void {
  ;(globalThis as { document?: unknown }).document = {}
}

describe('withModals', () => {
  beforeEach(() => {
    resetModalState()
    excluding('**')
  })

  afterEach(() => {
    delete (globalThis as { document?: unknown }).document
    delete (globalThis as { __STRATAL_INERTIA_SSR_EXCLUDE__?: string[] }).__STRATAL_INERTIA_SSR_EXCLUDE__
    resetSsrExcludeMatchers()
  })

  it('leaves an excluded level unresolved on a server, which has no entry to import it from', async () => {
    const resolve = resolver()

    await resolve('Parent/Index', pageWith(level('Parent/Edit')))

    expect(asked).toEqual(['Parent/Index'])
    expect(readModalComponents()['Parent/Edit']).toBeUndefined()
  })

  it('resolves an excluded level in a browser, where every page is in the glob', async () => {
    inBrowser()
    const resolve = resolver()

    await resolve('Parent/Index', pageWith(level('Parent/Edit')))

    expect(readModalComponents()['Parent/Edit']).toBe(Component)
  })

  it('resolves the whole chain a page carries, not only its top', async () => {
    inBrowser()
    const resolve = resolver()

    await resolve('Parent/Index', pageWith(level('Parent/Edit'), level('Parent/Show')))

    expect(Object.keys(readModalComponents()).sort()).toEqual(['Parent/Edit', 'Parent/Show'])
  })

  it('resolves an unexcluded level on a server, so it reaches the server render', async () => {
    excluding('Admin/**')
    const resolve = resolver()

    await resolve('Parent/Index', pageWith(level('Parent/Edit')))

    expect(readModalComponents()['Parent/Edit']).toBe(Component)
  })

  it('names the level it could not resolve, rather than failing as the page', async () => {
    inBrowser()
    const resolve = withModals((name: string) => {
      if (name === 'Parent/Edit') throw new Error('no such module')
      return Component
    })

    await expect(resolve('Parent/Index', pageWith(level('Parent/Edit'))))
      .rejects.toThrow('could not resolve modal component "Parent/Edit"')
  })
})
