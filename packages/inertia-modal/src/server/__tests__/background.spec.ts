import { describe, expect, it, vi } from 'vitest'

import type { Page } from '@inertiajs/core'
import { isNestedDispatch, type RouterContext } from 'stratal/router'

import { ModalBaseCycleError } from '../../errors/modal-base-cycle.error'
import { ModalBackgroundFetchError } from '../../errors/modal-background-fetch.error'
import { MODAL_DOCUMENT_HEADER, MODAL_MARKER_HEADER, type ModalData } from '../../core/wire'
import { HonoBackgroundDispatcher, isModalBackground, ModalBackground, type ModalBackgroundDispatcher } from '../background'

function createCtx(url = 'https://example.test/parent/1/child/2'): RouterContext {
  return {
    c: { req: { url, header: () => undefined }, env: {}, executionCtx: {} },
  } as unknown as RouterContext
}

function level(url: string, base: string): ModalData {
  return { component: 'Parent/Edit', props: {}, url, base, close: base }
}

function pageResponse(page: Partial<Page>): Response {
  return new Response(JSON.stringify(page), { status: 200 })
}

function modalResponse(data: ModalData): Response {
  return new Response(JSON.stringify({ props: { modal: data } }), {
    status: 200,
    headers: { [MODAL_MARKER_HEADER]: 'true' },
  })
}

/** A dispatcher answering from a map of pathname to response. */
function routes(map: Record<string, () => Response>): ModalBackgroundDispatcher {
  return {
    fetch(request) {
      const answer = map[new URL(request.url).pathname]
      if (answer === undefined) throw new Error(`no route for ${request.url}`)
      return Promise.resolve(answer())
    },
  }
}

describe('HonoBackgroundDispatcher', () => {
  it('marks its request so a modal route can tell it is a background', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    const dispatcher = new HonoBackgroundDispatcher({ fetch })
    const ctx = { c: { env: {}, executionCtx: {} } } as never

    await dispatcher.fetch(new Request('https://example.test/parent'), ctx)

    // Asserted through the reader rather than against a literal: what the header carries is the
    // package's own, and a route only ever asks the question.
    const sent = fetch.mock.calls[0][0] as Request
    const asRoute = {
      c: { req: { header: (name: string) => sent.headers.get(name) ?? undefined } },
    } as never

    expect(isModalBackground(asRoute)).toBe(true)
  })

  it('marks its request as a nested dispatch, so the router keeps it in this isolate', async () => {
    // The header it also sets is minted per isolate, so it only means anything to a route reached
    // without leaving one. This is what holds the dispatch here.
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    const dispatcher = new HonoBackgroundDispatcher({ fetch })
    const ctx = { c: { env: {}, executionCtx: {} } } as never

    await dispatcher.fetch(new Request('https://example.test/parent'), ctx)

    expect(isNestedDispatch(fetch.mock.calls[0][0] as Request)).toBe(true)
  })

  it('dispatches through the app it was given', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    const dispatcher = new HonoBackgroundDispatcher({ fetch })
    const ctx = { c: { env: { A: 1 }, executionCtx: { B: 2 } } } as never

    await dispatcher.fetch(new Request('https://example.test/parent'), ctx)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1]).toEqual({ A: 1 })
    expect(fetch.mock.calls[0][2]).toEqual({ B: 2 })
  })
})

describe('ModalBackground.chainFor', () => {
  it('stops at the first route that is not a modal', async () => {
    const background = new ModalBackground(routes({
      '/parent': () => pageResponse({ component: 'Parent/Index', props: { errors: {} } }),
    }))

    const chain = await background.chainFor(createCtx(), '/parent')

    expect(chain.page.component).toBe('Parent/Index')
    expect(chain.levels).toEqual([])
  })

  it('walks base to base and reports the levels outermost first', async () => {
    const background = new ModalBackground(routes({
      '/parent/1/edit': () => modalResponse(level('/parent/1/edit', '/parent')),
      '/parent': () => pageResponse({ component: 'Parent/Index', props: { errors: {} } }),
    }))

    const chain = await background.chainFor(createCtx(), '/parent/1/edit')

    expect(chain.page.component).toBe('Parent/Index')
    expect(chain.levels.map((entry) => entry.url)).toEqual(['/parent/1/edit'])
  })

  it('refuses a base chain that cycles rather than exhausting the sub-request budget', async () => {
    const background = new ModalBackground(routes({
      '/a': () => modalResponse(level('/a', '/b')),
      '/b': () => modalResponse(level('/b', '/a')),
    }))

    await expect(background.chainFor(createCtx(), '/a')).rejects.toBeInstanceOf(ModalBaseCycleError)
  })

  it('refuses a background that answers 2xx with a body that is not a page', async () => {
    // A `base` pointing at a route that does not render Inertia JSON. Reported as the same 502 as
    // every other unusable answer — left to `JSON.parse`, it escaped as a `SyntaxError` and
    // surfaced as a 500, which says nothing about the sub-request that caused it.
    const background = new ModalBackground(routes({
      '/parent': () => new Response('<!DOCTYPE html><p>not a page</p>', { status: 200 }),
    }))

    await expect(background.chainFor(createCtx(), '/parent')).rejects.toBeInstanceOf(ModalBackgroundFetchError)
  })

  it('keeps the parse failure as the cause, so the reason is not lost behind the status', async () => {
    const background = new ModalBackground(routes({
      '/parent': () => new Response('<!DOCTYPE html>', { status: 200 }),
    }))

    const error = await background.chainFor(createCtx(), '/parent').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ModalBackgroundFetchError)
    expect((error as Error).cause).toBeInstanceOf(SyntaxError)
  })

  it('refuses a background that answers with a redirect instead of a page', async () => {
    const background = new ModalBackground(routes({
      '/parent': () => new Response('', { status: 302 }),
    }))

    await expect(background.chainFor(createCtx(), '/parent')).rejects.toBeInstanceOf(ModalBackgroundFetchError)
  })
})


describe('isModalBackground', () => {
  /** A context over an arbitrary request, as a route receiving it would see. */
  function ctxOver(request: Request): RouterContext {
    return {
      c: { req: { header: (name: string) => request.headers.get(name) ?? undefined } },
    } as unknown as RouterContext
  }

  it('is true for the request the dispatcher sent into the app', async () => {
    // Asked from inside the app, where a route asks it — not of a request captured afterwards.
    let answered: boolean | undefined
    const app = {
      fetch: (request: Request) => {
        answered = isModalBackground(ctxOver(request))
        return Promise.resolve(new Response('{}', { status: 200 }))
      },
    }

    await new HonoBackgroundDispatcher(app).fetch(
      new Request('https://example.test/parent'),
      createCtx(),
    )

    expect(answered).toBe(true)
  })

  it('is false for an ordinary request', () => {
    expect(isModalBackground(ctxOver(new Request('https://example.test/parent')))).toBe(false)
  })

  it('is false for a client that sends the header itself', () => {
    // The header decides whether a route that refuses clients answers instead, so its presence
    // cannot be the whole answer: it carries a value that rides only on requests this package
    // makes, and never reaches a client to be copied.
    const claimed = new Request('https://example.test/parent', {
      headers: { [MODAL_DOCUMENT_HEADER]: '1' },
    })

    expect(isModalBackground(ctxOver(claimed))).toBe(false)
  })
})
