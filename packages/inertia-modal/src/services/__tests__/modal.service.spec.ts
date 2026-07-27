import { describe, expect, it, vi } from 'vitest'
import type { Page } from '@inertiajs/core'
import type { DocumentRendererService } from '@stratal/inertia'
import { ModalService } from '../modal.service'

/** A minimal RouterContext for a full-page (direct) visit unless x-inertia is set. */
function createCtx(url: string, headers: Record<string, string> = {}) {
  return {
    c: {
      req: {
        url,
        header: (name: string) => headers[name.toLowerCase()],
      },
      env: {},
      executionCtx: {},
    },
  }
}

/** A background page as returned by the internal Inertia JSON sub-request. */
function backgroundPage(component: string): Page {
  return {
    component,
    props: { errors: {} },
    url: '/parent',
    version: null,
    flash: {},
    rememberedState: {},
    rescuedProps: [],
  }
}

function createService(bgComponent: string) {
  const app = {
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify(backgroundPage(bgComponent)), { status: 200 }),
    ),
  }
  const documentRenderer = {
    render: vi.fn().mockResolvedValue(
      new Response('<html>document</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    ),
  } as unknown as DocumentRendererService

  const service = new (ModalService as any)(app, documentRenderer)
  return { service, app, documentRenderer }
}

function renderModal(service: ModalService, headers: Record<string, string> = {}) {
  const ctx = createCtx('https://app.test/parent/42/edit', headers)
  return service.render(
    ctx as any,
    'Parent/Edit',
    { item: { id: '42' } },
    { baseURL: '/parent' },
  )
}

describe('ModalService', () => {
  it('delegates the combined page to the document renderer on a direct visit', async () => {
    const { service, documentRenderer } = createService('Admin/Dashboard')

    const response = await renderModal(service)

    const render = documentRenderer.render as ReturnType<typeof vi.fn>
    expect(render).toHaveBeenCalledOnce()

    // The combined page carries the background component, the modal opts under
    // `props.modal`, and the modal URL (so the address bar stays on the modal).
    const [page] = render.mock.calls[0] as [Page]
    expect(page.component).toBe('Admin/Dashboard')
    expect((page.props as Record<string, unknown>).modal).toMatchObject({
      component: 'Parent/Edit',
    })
    expect(page.url).toBe('/parent/42/edit')

    // The response is whatever the document renderer produced.
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<html>document</html>')
  })

  it('returns Inertia JSON without rendering a document for x-inertia requests', async () => {
    const { service, documentRenderer } = createService('Admin/Dashboard')

    const response = await renderModal(service, { 'x-inertia': 'true' })

    expect(documentRenderer.render).not.toHaveBeenCalled()
    expect(response.headers.get('x-inertia')).toBe('true')
    expect(response.headers.get('content-type')).toBe('application/json')

    const page = (await response.json()) as Page
    expect(page.component).toBe('Admin/Dashboard')
    expect((page.props as Record<string, unknown>).modal).toMatchObject({
      component: 'Parent/Edit',
    })
  })
})
