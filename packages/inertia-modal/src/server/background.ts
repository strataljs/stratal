// How the page beneath a modal is rendered, and by whom.
//
// Behind a token so an application can substitute its own dispatcher — one that goes through a
// response-cache gateway entrypoint, say — without this package knowing anything about caching.
import type { Page } from '@inertiajs/core'
import { inject, Transient } from 'stratal/di'
import { markNestedDispatch, ROUTER_TOKENS, type RouterContext } from 'stratal/router'

import { ModalBackgroundFetchError } from '../errors/modal-background-fetch.error'
import { ModalBaseCycleError } from '../errors/modal-base-cycle.error'
import { isModalData, MODAL_DOCUMENT_HEADER, MODAL_MARKER_HEADER, MODAL_PROP, type ModalData } from '../core/wire'
import { MODAL_TOKENS } from '../tokens'

/** What this package needs of the app it dispatches into. */
interface FetchableApp {
  fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>
}

export interface ModalBackgroundDispatcher {
  fetch(request: Request, ctx: RouterContext): Promise<Response>
}

/**
 * What the marker header carries, minted once and never sent to a client.
 *
 * The answer has to survive every hop between the dispatch and the route — a caching entrypoint
 * re-dispatches the request, and each hop rebuilds it — so it travels in a header, the only thing
 * that does. A header is otherwise a value anyone can send, and this one decides whether a route
 * that refuses clients answers instead; carrying a value from here closes that, because the value
 * rides only on requests this package makes and is never part of a response.
 *
 * Minted on first use rather than at module scope, where a runtime may refuse to generate it.
 */
let token: string | undefined

function backgroundToken(): string {
  return (token ??= crypto.randomUUID())
}

/**
 * Whether this request is the background render issued for the page beneath a modal.
 *
 * A route that answers a client with a redirect still has to render when it is the `base` of a
 * modal that client may open — otherwise the redirect is followed back to the modal and the chain
 * reports a cycle.
 *
 * A dispatcher that leaves the isolate answers `false` on the far side, which is the safe
 * direction: the route gates as it would for a client rather than opening for one.
 *
 * @example
 * ```typescript
 * if (isModalBackground(ctx)) return next()
 * ```
 */
export function isModalBackground(ctx: RouterContext): boolean {
  return ctx.c.req.header(MODAL_DOCUMENT_HEADER) === backgroundToken()
}

/**
 * The default: the app itself, in process.
 *
 * The marker header goes on here rather than at the call site, so every dispatcher gets it — a
 * route that renders differently as a background must not depend on which one is installed.
 */
@Transient()
export class HonoBackgroundDispatcher implements ModalBackgroundDispatcher {
  constructor(@inject(ROUTER_TOKENS.HonoApp) private readonly app: FetchableApp) {}

  fetch(request: Request, ctx: RouterContext): Promise<Response> {
    // Marked as a nested dispatch as well as with the header, and the two are
    // not the same claim. The header says *what* this render is, to whichever
    // route answers it; the mark says the app dispatched it into itself, which
    // is what keeps the router from handing it to anything that would answer
    // it somewhere else — the header is minted in this isolate and means
    // nothing outside it.
    const marked = markNestedDispatch(new Request(request))
    marked.headers.set(MODAL_DOCUMENT_HEADER, backgroundToken())

    return this.app.fetch(marked, ctx.c.env, ctx.c.executionCtx)
  }
}

/** The page beneath a modal, and the modal levels between the two. */
export interface ModalChain {
  page: Page
  /** Outermost first. Empty when the requested level sits directly on a page. */
  levels: ModalData[]
}

/**
 * Headers a background render needs to answer as the caller would have been answered.
 *
 * The host and the forwarded set matter because middleware reconstructs the canonical request URL
 * from them, and auth derives its cookie name from that URL's protocol — without them a background
 * render is unauthenticated even though the cookie was forwarded.
 */
const FORWARDED_HEADERS = [
  'cookie',
  'host',
  'x-forwarded-proto',
  'x-forwarded-host',
  'x-forwarded-for',
  'x-forwarded-port',
  'x-real-ip',
  'accept-language',
  'user-agent',
] as const

/**
 * Walks `base` to `base` until it reaches a route that is not a modal.
 *
 * Only a document request gets here: an Inertia visit has a page mounted to graft onto, so there is
 * nothing to rebuild.
 */
@Transient()
export class ModalBackground {
  constructor(
    @inject(MODAL_TOKENS.BackgroundDispatcher) private readonly dispatcher: ModalBackgroundDispatcher,
  ) {}

  async chainFor(ctx: RouterContext, base: string): Promise<ModalChain> {
    const origin = new URL(ctx.c.req.url).origin
    const levels: ModalData[] = []
    // A chain is bounded by the set of distinct routes in it, so the routes already followed are
    // the whole budget — no counter needed.
    const followed = new Set<string>()

    let next = base
    for (;;) {
      const url = new URL(next, origin)
      if (followed.has(url.pathname)) {
        throw new ModalBaseCycleError(url.pathname)
      }
      followed.add(url.pathname)

      const response = await this.dispatcher.fetch(this.requestFor(ctx, url), ctx)
      const body = await response.text()
      if (body === '' || response.status >= 300) {
        throw new ModalBackgroundFetchError()
      }

      // A 2xx whose body is not a page: a `base` pointing at a route that answers something other
      // than Inertia JSON. That is the same class of answer as the checks above — the chain cannot
      // be built from it — so it reports as one rather than escaping as a bare `SyntaxError`.
      let page: Page
      try {
        page = JSON.parse(body) as Page
      } catch (error) {
        throw new ModalBackgroundFetchError(error)
      }

      if (response.headers.get(MODAL_MARKER_HEADER) !== 'true') {
        return { page, levels }
      }

      const level = page.props[MODAL_PROP]
      if (!isModalData(level)) {
        // Marked as a modal but carrying something else: a build on the other side of a deploy, or
        // a route writing to that prop name itself. Either way there is no level to place.
        throw new ModalBackgroundFetchError()
      }

      levels.unshift(level)
      next = level.base
    }
  }

  private requestFor(ctx: RouterContext, url: URL): Request {
    const headers = new Headers({
      // Answer as JSON: the document is rendered here, from the combined page object.
      'x-inertia': 'true',
      'accept': 'application/json',
      // `x-inertia-version` is deliberately absent. A version mismatch answers 409 with no body,
      // which this would have nothing to parse, and a sub-request needs no cache-bust check.
    })

    for (const name of FORWARDED_HEADERS) {
      const value = ctx.c.req.header(name)
      if (value !== undefined && value !== '') headers.set(name, value)
    }

    return new Request(url.toString(), { method: 'GET', headers })
  }
}
