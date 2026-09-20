/// <reference lib="dom" />
import type { HttpRequestConfig, HttpResponse, Page } from '@inertiajs/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InertiaModuleOptions } from '../inertia.options'
import { DocumentRendererService } from '../services/document-renderer.service'
import { InertiaService } from '../services/inertia.service'
import type { SeoService } from '../services/seo.service'
import type { SsrRendererService } from '../services/ssr-renderer.service'
import type { TemplateService } from '../services/template.service'
import { createMockContext } from './support/mock-router-context'

/**
 * Drives the real `@inertiajs/react` `<InfiniteScroll>` over pages this package
 * actually emits, so the wire contract is proven by its consumer rather than
 * restated by an assertion. The client's fetch is answered by a second
 * `InertiaService.render()` fed the headers and query the client itself chose,
 * which makes the round trip — metadata out, request in, merged page out —
 * end to end.
 */

const options: InertiaModuleOptions = {
  rootView: '<html>@inertia</html>',
  version: '1.0',
}

function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({ start(controller) { controller.close() } })
}

function makeService(): InertiaService {
  const template = {
    renderStream: vi.fn().mockReturnValue(emptyStream()),
    renderClientOnly: vi.fn().mockReturnValue('<html><div id="app"></div></html>'),
  } as unknown as TemplateService

  const ssr = {
    render: vi.fn().mockResolvedValue({ head: [], stream: emptyStream() }),
  } as unknown as SsrRendererService

  const seo = {
    resolve: vi.fn().mockResolvedValue({}),
    tagsFor: vi.fn().mockReturnValue([]),
  } as unknown as SeoService

  return new InertiaService(options, new DocumentRendererService(options, ssr, template), seo)
}

const TOTAL_PAGES = 2

/**
 * Page 1 is ids 1–3 and page 2 is ids 3–5: id 3 is on both, which is what a row
 * touched between two requests looks like. Without a working `matchOn` the
 * merged list carries it twice.
 */
function feedRows(page: number): { id: number; title: string }[] {
  const rows = [
    { id: 1, title: 'one' },
    { id: 2, title: 'two' },
    { id: 3, title: 'three' },
    { id: 4, title: 'four' },
    { id: 5, title: 'five' },
  ]
  return page === 1 ? rows.slice(0, 3) : rows.slice(2, 5)
}

/** Renders the `Feed` page the way a controller would, for one incoming request. */
async function renderFeed(request: { url?: string; headers?: Record<string, string> } = {}): Promise<Response> {
  const service = makeService()
  const url = request.url ?? 'http://localhost/feed'
  const ctx = createMockContext({ isInertia: true, url, headers: request.headers })
  const page = Number(new URL(url).searchParams.get('page') ?? '1')

  return service.render(ctx, 'Feed', {
    items: service.scroll(
      () => ({
        data: feedRows(page),
        pagination: { page, limit: 3, total: 5, totalPages: TOTAL_PAGES },
      }),
      { matchOn: 'id' },
    ),
  })
}

async function feedPageObject(request: Parameters<typeof renderFeed>[0] = {}): Promise<Page> {
  return (await renderFeed(request)).json() as Promise<Page>
}

/** Rebuilds the whole client module graph so each test gets a fresh page store. */
async function bootClient() {
  vi.resetModules()

  const [core, react, reactDom, inertiaReact] = await Promise.all([
    import('@inertiajs/core'),
    import('react'),
    import('react-dom/client'),
    import('@inertiajs/react'),
  ])

  return { core, react, reactDom, inertiaReact }
}

type ClientModules = Awaited<ReturnType<typeof bootClient>>

interface MountResult {
  container: HTMLElement
  /** The imperative handle `<InfiniteScroll>` exposes — `hasNext`, `fetchNext`, … */
  scroll: { fetchNext: () => void; fetchPrevious: () => void; hasNext: () => boolean; hasPrevious: () => boolean }
  rendered: () => string[]
  unmount: () => void
}

/**
 * Mounts `<App><Feed/></App>` with a manual-mode `<InfiniteScroll>` bound to the
 * `items` prop, and hands back its imperative handle.
 */
async function mountFeed(modules: ClientModules, initialPage: Page): Promise<MountResult> {
  const { react, reactDom, inertiaReact } = modules
  const { createElement, act, createRef } = react
  const { App, InfiniteScroll, usePage } = inertiaReact

  const scrollRef = createRef<MountResult['scroll']>()
  const container = document.createElement('div')
  document.body.appendChild(container)

  function Feed() {
    const page = usePage() as unknown as { props: { items: { data: { id: number; title: string }[] } } }

    return createElement(
      InfiniteScroll,
      { data: 'items', manual: true, ref: scrollRef },
      page.props.items.data.map((row) => createElement('span', { key: row.id, 'data-row': String(row.id) }, row.title)),
    )
  }

  const root = reactDom.createRoot(container)

  await act(async () => {
    root.render(createElement(App, {
      initialPage,
      initialComponent: Feed,
      resolveComponent: () => Feed,
    }))
    // `<InfiniteScroll>` resolves its items element through a state update, so
    // the effect that builds the scroll manager runs a microtask later.
    await Promise.resolve()
  })

  return {
    container,
    get scroll() {
      if (!scrollRef.current) throw new Error('<InfiniteScroll> did not expose its handle')
      return scrollRef.current
    },
    rendered: () => [...container.querySelectorAll('[data-row]')].map((el) => el.getAttribute('data-row') ?? ''),
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

let mounted: MountResult | null = null

beforeEach(() => {
  // `useInfiniteScroll` observes its trigger elements; jsdom has no
  // IntersectionObserver, and the observers are irrelevant in manual mode.
  vi.stubGlobal('IntersectionObserver', class {
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
    takeRecords() { return [] }
  })
  // React 19 requires this flag before `act()` will flush effects.
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.history.replaceState({}, '', '/feed')
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('<InfiniteScroll> over a Stratal-rendered page', () => {
  it('mounts and reads the pagination state off scrollProps', async () => {
    const modules = await bootClient()
    const page = await feedPageObject()

    mounted = await mountFeed(modules, page)

    expect(mounted.rendered()).toEqual(['1', '2', '3'])
    // page 1 of 2: nextPage is 2, previousPage is null
    expect(mounted.scroll.hasNext()).toBe(true)
    expect(mounted.scroll.hasPrevious()).toBe(false)
  })

  it('reads a null nextPage as "no more pages"', async () => {
    const modules = await bootClient()
    const page = await feedPageObject({ url: 'http://localhost/feed?page=2' })

    mounted = await mountFeed(modules, page)

    expect(page.scrollProps?.items).toMatchObject({ nextPage: null, previousPage: 1, currentPage: 2 })
    expect(mounted.scroll.hasNext()).toBe(false)
    expect(mounted.scroll.hasPrevious()).toBe(true)
  })

  it('throws the client\'s own error when the page carries no scrollProps', async () => {
    const modules = await bootClient()
    const page = await feedPageObject()
    delete page.scrollProps

    await expect(mountFeed(modules, page)).rejects.toThrow(
      'The page object does not contain a scroll prop named "items"',
    )
  })

  it('fetches, merges and deduplicates the next page through the real client', async () => {
    const modules = await bootClient()
    const { core } = modules

    const requests: HttpRequestConfig[] = []

    core.http.setClient({
      async request(config: HttpRequestConfig): Promise<HttpResponse> {
        requests.push(config)

        // Answer with the same server code, driven by the request the client
        // built: its page parameter and its merge-intent header.
        const url = new URL(config.url, 'http://localhost')
        for (const [key, value] of Object.entries(config.params ?? {})) {
          url.searchParams.set(key, String(value))
        }

        const headers: Record<string, string> = {}
        for (const [key, value] of Object.entries(config.headers ?? {})) {
          headers[key.toLowerCase()] = String(value)
        }

        const response = await renderFeed({ url: url.toString(), headers })
        const responseHeaders: Record<string, string> = {}
        response.headers.forEach((value, key) => { responseHeaders[key.toLowerCase()] = value })

        return { status: response.status, data: await response.text(), headers: responseHeaders }
      },
    })

    const view = await mountFeed(modules, await feedPageObject())
    mounted = view

    await modules.react.act(async () => {
      view.scroll.fetchNext()
      await vi.waitFor(() => expect(requests).toHaveLength(1))
    })

    const [request] = requests
    // The identifier the server published as `nextPage`, sent back under the
    // name it published as `pageName`.
    expect(new URL(request.url, 'http://localhost').searchParams.get('page')).toBe('2')
    expect(request.headers).toMatchObject({
      'X-Inertia-Infinite-Scroll-Merge-Intent': 'append',
      'X-Inertia-Partial-Data': 'items',
    })

    // Five rows, not six: `matchPropsOn` collapsed the id 3 that both pages
    // carry. Order is page 1 followed by the rows page 2 adds.
    await vi.waitFor(() => {
      expect(view.rendered()).toEqual(['1', '2', '3', '4', '5'])
    })
    expect(view.scroll.hasNext()).toBe(false)
  })
})
