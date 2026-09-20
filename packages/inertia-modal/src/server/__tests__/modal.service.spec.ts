import type { Page } from '@inertiajs/core'
import { InertiaService, SeoService, type DocumentRendererService, type InertiaModuleOptions } from '@stratal/inertia'
import type { RouterContext } from 'stratal/router'
import { describe, expect, it, vi } from 'vitest'

import { MODAL_MARKER_HEADER, MODAL_PROP, modalPropPath, type ModalData } from '../../core/wire'
import { ModalBaseCycleError } from '../../errors/modal-base-cycle.error'
import { ModalBackground, type ModalBackgroundDispatcher } from '../background'
import { ModalService } from '../modal.service'

const ORIGIN = 'https://app.test'
const LEVEL_URL = `${ORIGIN}/parent/42/edit`

function createCtx(
  url: string,
  headers: Record<string, string> = {},
  store: Record<string, unknown> = {},
): RouterContext {
  const header = (name: string) => headers[name.toLowerCase()]
  return {
    header,
    c: {
      req: { url, header },
      env: {},
      executionCtx: {},
      get: (key: string) => store[key],
    },
  } as unknown as RouterContext
}

function pageBody(component: string, props: Record<string, unknown> = {}): string {
  return JSON.stringify({
    component,
    props: { errors: {}, ...props },
    url: '/parent',
    version: null,
    flash: {},
    rememberedState: {},
    rescuedProps: [],
  } satisfies Page)
}

function modalBody(data: ModalData): string {
  return JSON.stringify({ props: { modal: data } })
}

/** A dispatcher answering from a map of pathname to body, recording what it was asked for. */
function dispatcher(map: Record<string, () => Response>) {
  const dispatched: string[] = []
  const value: ModalBackgroundDispatcher = {
    fetch(request) {
      const path = new URL(request.url).pathname
      dispatched.push(path)
      const answer = map[path]
      if (answer === undefined) throw new Error(`no route for ${path}`)
      return Promise.resolve(answer())
    },
  }
  return { dispatched, value }
}

function createService(routes: Record<string, () => Response> = {
  '/parent': () => new Response(pageBody('Parent/Index'), { status: 200 }),
}) {
  const dispatch = dispatcher(routes)
  const documentRenderer = {
    render: vi.fn().mockResolvedValue(new Response('<html>document</html>', { status: 200 })),
  }
  // The REAL InertiaService and SeoService, so a level's props and metadata go through the same
  // resolution a page's do. Only the collaborators this path never reaches are stubbed.
  const options: InertiaModuleOptions = { rootView: '<html>@inertia</html>' }
  const seo = new SeoService(options, { buildLinks: () => [] } as never)
  const inertia = new InertiaService(options, documentRenderer as unknown as DocumentRendererService, seo)
  const service = new ModalService(
    documentRenderer as unknown as DocumentRendererService,
    inertia,
    seo,
    new ModalBackground(dispatch.value),
  )

  return { service, documentRenderer, dispatched: dispatch.dispatched }
}

function render(
  service: ModalService,
  headers: Record<string, string> = {},
  base = '/parent',
  url = LEVEL_URL,
  props: Record<string, unknown> = { title: 'Edit', items: ['a'] },
) {
  return service.render(createCtx(url, headers), 'Parent/Edit', props, { base })
}

async function levelOf(response: Response): Promise<ModalData> {
  const page = (await response.json()) as Page
  const level = page.props.modal
  if (level === undefined || level === null) throw new Error('the response carries no modal')
  return level
}

const VISIT = { 'x-inertia': 'true' }

/** A `ctx.defer()` prop, as the level would carry one. */
const DEFERRED = {
  [Symbol.for('stratal:inertia:prop:deferred')]: true as const,
  callback: () => 'resolved',
  group: 'default',
}

describe('ModalService on an Inertia visit', () => {
  it('answers with the modal alone and renders no background', async () => {
    const { service, documentRenderer, dispatched } = createService()

    const response = await render(service, VISIT)

    expect(dispatched).toEqual([])
    expect(documentRenderer.render).not.toHaveBeenCalled()
    expect(await levelOf(response)).toMatchObject({ component: 'Parent/Edit', url: '/parent/42/edit' })
  })

  it('marks the response so a visit that arrived by redirect still grafts', async () => {
    // The decision is response-side. A 302 into a modal route carries whatever the original visit
    // carried, which for a plain visit is no partial headers at all — so a request-side rule could
    // never fire here.
    const response = await render(createService().service, VISIT)

    expect(response.headers.get(MODAL_MARKER_HEADER)).toBe('true')
  })

  it('records where the level closes, keeping the query the list was filtered by', async () => {
    const response = await render(createService().service, {
      ...VISIT,
      referer: `${ORIGIN}/parent?tab=fees&page=3`,
    })

    expect((await levelOf(response)).close).toBe('/parent?tab=fees&page=3')
  })
})

describe('ModalService on a document request', () => {
  it('renders the page beneath, and only then', async () => {
    const { service, documentRenderer, dispatched } = createService()

    await render(service)

    expect(dispatched).toEqual(['/parent'])
    const [page] = documentRenderer.render.mock.calls[0] as [Page]
    expect(page.component).toBe('Parent/Index')
    expect(page.url).toBe('/parent/42/edit')
    expect(page.props.modal).toMatchObject({ component: 'Parent/Edit' })
  })

  it('walks base to base until it reaches a page, outermost first', async () => {
    // A deep url reached cold has to rebuild the chain, and the bottom of it is the page.
    const { service, documentRenderer } = createService({
      '/parent/42/edit': () => new Response(
        modalBody({ component: 'Parent/Edit', props: {}, url: '/parent/42/edit', base: '/parent', close: '/parent' }),
        { status: 200, headers: { [MODAL_MARKER_HEADER]: 'true' } },
      ),
      '/parent': () => new Response(pageBody('Parent/Index'), { status: 200 }),
    })

    await service.render(
      createCtx(`${ORIGIN}/parent/42/child/7/edit`),
      'Child/Edit',
      {},
      { base: '/parent/42/edit' },
    )

    const [page] = documentRenderer.render.mock.calls[0] as [Page]
    expect(page.props.modalBeneath?.map((level) => level.component)).toEqual(['Parent/Edit'])
  })

  it('refuses a base chain that cycles rather than exhausting the sub-request budget', async () => {
    const { service } = createService({
      '/a': () => new Response(
        modalBody({ component: 'A', props: {}, url: '/a', base: '/b', close: '/b' }),
        { status: 200, headers: { [MODAL_MARKER_HEADER]: 'true' } },
      ),
      '/b': () => new Response(
        modalBody({ component: 'B', props: {}, url: '/b', base: '/a', close: '/a' }),
        { status: 200, headers: { [MODAL_MARKER_HEADER]: 'true' } },
      ),
    })

    await expect(render(service, {}, '/a')).rejects.toBeInstanceOf(ModalBaseCycleError)
  })
})

describe('ModalService partial reloads', () => {
  it('answers a targeted reload with the named level props, addressed without a key', async () => {
    const response = await render(createService().service, {
      ...VISIT,
      'x-inertia-partial-component': 'Parent/Index',
      'x-inertia-partial-data': modalPropPath('items'),
      referer: LEVEL_URL,
    })

    const level = await levelOf(response)
    expect(Object.keys(level.props)).toEqual(['items'])
  })

  it('resolves a deferred level prop the client asks for by its page-anchored path', async () => {
    // The loop this closes: the client addresses a level prop where it sees it (`modal.props.x`),
    // while the level's own props are keyed bare. Resolved against the raw names, nothing matches,
    // the deferred prop never runs, and the level answers empty — which `<Deferred>` reads as the
    // prop still being missing, so it asks again, and again.
    const response = await render(
      createService().service,
      {
        ...VISIT,
        'x-inertia-partial-component': 'Parent/Index',
        'x-inertia-partial-data': modalPropPath('detail'),
        referer: LEVEL_URL,
      },
      '/parent',
      LEVEL_URL,
      { title: 'Edit', detail: DEFERRED },
    )

    const level = await levelOf(response)
    expect(level.props).toEqual({ detail: 'resolved' })
  })

  it('advertises a level deferred prop at its anchored path when the level renders whole', async () => {
    const response = await render(
      createService().service,
      VISIT,
      '/parent',
      LEVEL_URL,
      { title: 'Edit', detail: DEFERRED },
    )

    const page = (await response.json()) as Page & { deferredProps?: Record<string, string[]> }
    expect(page.deferredProps).toEqual({ default: [modalPropPath('detail')] })
  })

  it('does not advertise them again on a reload the level was not asked about', async () => {
    // The loop this closes is not infinite, which is why it survived: the client fetches the
    // deferred prop once per response that re-announces it, so a page with two other mount-time
    // reloads fetched one level prop three times over.
    const response = await render(
      createService().service,
      {
        ...VISIT,
        'x-inertia-partial-component': 'Parent/Index',
        'x-inertia-partial-data': 'unreadCount',
        referer: LEVEL_URL,
      },
      '/parent',
      LEVEL_URL,
      { title: 'Edit', detail: DEFERRED },
    )

    const page = (await response.json()) as Page & { deferredProps?: Record<string, string[]> }
    expect(page.deferredProps).toBeUndefined()
  })

  it('leaves the level alone on a partial reload for a page prop', async () => {
    // Not addressed to the level, and the client holds it already — so the level is not sent, and
    // Inertia's own merge leaves the one the client holds untouched. Resolving it again would find
    // its `defer()` props still unresolved and advertise them a second time, which the client
    // answers by fetching them a second time; once per reload the page around it makes.
    //
    // Sending it with no props says something else entirely — that the level now has none — and a
    // client that reads the response as written renders the sheet empty.
    const response = await render(createService().service, {
      ...VISIT,
      'x-inertia-partial-component': 'Parent/Index',
      'x-inertia-partial-data': 'unreadCount',
      referer: LEVEL_URL,
    })

    const page = (await response.json()) as Page
    expect(page.props[MODAL_PROP]).toBeUndefined()
  })

  it('returns the level whole when the request asks for the level itself', async () => {
    // What `<ModalLink>` sends: `only: ['modal']`, whose header names the level and nothing inside
    // it. Reaching this from the level's own url is an ordinary move between two query variants of
    // one modal route — a tab inside a sheet. Narrowing to the props named *inside* the level
    // leaves none, and the client merges that empty answer over what it holds, so the sheet keeps
    // its old contents and the visit appears to have done nothing.
    const response = await render(createService().service, {
      ...VISIT,
      'x-inertia-partial-component': 'Parent/Index',
      'x-inertia-partial-data': MODAL_PROP,
      referer: LEVEL_URL,
    })

    expect(Object.keys((await levelOf(response)).props).sort()).toEqual(['items', 'title'])
  })

  it('returns the level whole when the request did not come from the level itself', async () => {
    // Partial headers survive a same-origin redirect, so a submission that redirects into a modal
    // route arrives naming props the client asked of a different page. Narrowing there would leave
    // the level with holes nothing will ever fill; the referer is what tells the two apart.
    const response = await render(createService().service, {
      ...VISIT,
      'x-inertia-partial-component': 'Parent/Index',
      'x-inertia-partial-data': modalPropPath('items'),
      referer: `${ORIGIN}/somewhere/else`,
    })

    expect(Object.keys((await levelOf(response)).props).sort()).toEqual(['items', 'title'])
  })
})


describe('ModalService flash', () => {
  it('carries the flash a redirect into the modal route left behind', async () => {
    // A submission that flashes its result and redirects into a sheet is the whole reason this
    // path has to carry it: flash is read once, so dropping it here loses the result outright.
    const { service } = createService()

    const response = await service.render(
      createCtx(LEVEL_URL, VISIT, { inertiaFlash: { purchase: 'settled' } }),
      'Parent/Edit',
      {},
      { base: '/parent' },
    )

    const page = (await response.json()) as Page
    expect(page.flash).toEqual({ purchase: 'settled' })
  })

  it('lifts errors out of the flash into props, and does not leave them on it', async () => {
    const { service } = createService()

    const response = await service.render(
      createCtx(LEVEL_URL, VISIT, { inertiaFlash: { errors: { title: 'Required' }, kept: 1 } }),
      'Parent/Edit',
      {},
      { base: '/parent' },
    )

    const page = (await response.json()) as Page
    expect(page.props.errors).toEqual({ title: 'Required' })
    expect(page.flash).toEqual({ kept: 1 })
  })

  it('answers a document request with its own flash, not the background page\'s', async () => {
    // The page beneath is fetched as a request of its own, with its own store. Spreading its page
    // object would answer with that request's flash instead of the one this request carries.
    const beneath = JSON.stringify({
      component: 'Parent/Index',
      props: { errors: {} },
      url: '/parent',
      version: null,
      flash: { fromTheBackground: true },
      rememberedState: {},
      rescuedProps: [],
    } satisfies Page)
    const { service, documentRenderer } = createService({
      '/parent': () => new Response(beneath, { status: 200 }),
    })

    await service.render(
      createCtx(LEVEL_URL, {}, { inertiaFlash: { purchase: 'settled' } }),
      'Parent/Edit',
      {},
      { base: '/parent' },
    )

    const [page] = documentRenderer.render.mock.calls[0] as [Page]
    expect(page.flash).toEqual({ purchase: 'settled' })
  })
})
