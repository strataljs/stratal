// The header has to reach the visits this package never sees: a plain `<Link>`, a `router.visit`
// after a submit. Those are the hops that aim one level at another, and no option set at this
// package's own call sites can travel with them — so the seam under test is the router's.
//
// `document` is what tells the installer which runtime it is in, and this suite runs in Node, so a
// browser is simulated by defining it — the only thing the code under test asks about.
import type { HttpRequestConfig } from '@inertiajs/core'
import { interceptors } from '@inertiajs/core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { encodeHeldLevels, MODAL_HELD_HEADER, type ModalData } from '../../core/wire'
import { nameHeldLevels } from '../held-header'
import { withModals } from '../resolver'
import { clearHeldStack, holdStack } from '../stack-store'

const Component = () => null

const level: ModalData = {
  component: 'Parent/Edit',
  props: {},
  url: '/parent/42/edit',
  base: '/parent/42',
  close: '/parent/42',
}

/** A request as the router builds one, carrying none of this package's visit options. */
function foreignVisit(): HttpRequestConfig {
  return { method: 'get', url: '/parent/42/notes', headers: { 'X-Inertia': true } }
}

const onVisitRequest = vi.spyOn(interceptors, 'onVisitRequest')

describe('the held-levels header', () => {
  beforeAll(async () => {
    ;(globalThis as { document?: unknown }).document = {}

    const resolve = withModals(() => Component)
    await resolve('Parent/Index')
    await resolve('Parent/Show')
  })

  afterAll(() => {
    delete (globalThis as { document?: unknown }).document
    clearHeldStack()
    vi.restoreAllMocks()
  })

  it('is attached by the router, so every visit carries it whoever issued it', () => {
    expect(onVisitRequest).toHaveBeenCalledExactlyOnceWith(nameHeldLevels)
  })

  it('names the open levels on a visit this package did not issue', () => {
    holdStack([level])

    expect(nameHeldLevels(null, foreignVisit()).headers).toEqual({
      'X-Inertia': true,
      [MODAL_HELD_HEADER]: encodeHeldLevels(['/parent/42/edit']),
    })
  })

  it('says the client holds nothing rather than going silent', () => {
    // Read as the request is built, not when the visit was set up: a value captured earlier
    // describes the stack as it was one level ago.
    clearHeldStack()

    expect(nameHeldLevels(null, foreignVisit()).headers?.[MODAL_HELD_HEADER]).toBe('')
  })
})
