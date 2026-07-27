import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page } from '@inertiajs/core'
import type { InertiaModuleOptions } from '../inertia.options'
import { DocumentRendererService } from '../services/document-renderer.service'
import { resetSsrExcludeMatchers } from '../services/ssr-exclusion'
import type { SsrRendererService } from '../services/ssr-renderer.service'
import type { TemplateService } from '../services/template.service'

const SSR_EXCLUDE_GLOBAL = '__STRATAL_INERTIA_SSR_EXCLUDE__'

function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({ start: (c) => c.close() })
}

function createPage(component: string): Page {
  return {
    component,
    props: { errors: {} },
    url: '/',
    version: null,
    flash: {},
    rememberedState: {},
    rescuedProps: [],
  }
}

describe('DocumentRendererService', () => {
  let mockSsr: SsrRendererService
  let mockTemplate: TemplateService

  const ssrOption = {
    bundle: vi.fn() as unknown as NonNullable<InertiaModuleOptions['ssr']>['bundle'],
  }

  beforeEach(() => {
    mockSsr = {
      render: vi.fn().mockResolvedValue({ head: [], stream: emptyStream() }),
    } as unknown as SsrRendererService
    mockTemplate = {
      renderStream: vi.fn().mockReturnValue(emptyStream()),
      renderClientOnly: vi.fn().mockReturnValue('<html><div id="app"></div></html>'),
    } as unknown as TemplateService
  })

  afterEach(() => {
    ;(globalThis as Record<string, unknown>)[SSR_EXCLUDE_GLOBAL] = undefined
    resetSsrExcludeMatchers()
  })

  // The exclusion matchers are memoized per isolate from the global the Vite
  // plugin defines, so set the global and reset the memo *before* constructing.
  function makeRenderer(opts: InertiaModuleOptions, exclude: string[] = []): DocumentRendererService {
    ;(globalThis as Record<string, unknown>)[SSR_EXCLUDE_GLOBAL] = exclude
    resetSsrExcludeMatchers()
    return new DocumentRendererService(opts, mockSsr, mockTemplate)
  }

  it('streams SSR for a component that is not excluded', async () => {
    const renderer = makeRenderer({ rootView: '', ssr: ssrOption }, ['Admin/**'])

    const response = await renderer.render(createPage('Notes/Index'))

    expect(mockSsr.render).toHaveBeenCalledOnce()
    expect(mockTemplate.renderStream).toHaveBeenCalledOnce()
    expect(mockTemplate.renderClientOnly).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
  })

  it('renders client-only for a build-time excluded component', async () => {
    const renderer = makeRenderer({ rootView: '', ssr: ssrOption }, ['Admin/**'])

    await renderer.render(createPage('Admin/Dashboard'))

    expect(mockSsr.render).not.toHaveBeenCalled()
    expect(mockTemplate.renderClientOnly).toHaveBeenCalledOnce()
  })

  it('renders client-only when SSR is not configured', async () => {
    const renderer = makeRenderer({ rootView: '' })

    await renderer.render(createPage('Notes/Index'))

    expect(mockSsr.render).not.toHaveBeenCalled()
    expect(mockTemplate.renderClientOnly).toHaveBeenCalledOnce()
  })

  it('appends extraHead after the SSR head when streaming', async () => {
    ;(mockSsr.render as ReturnType<typeof vi.fn>).mockResolvedValue({
      head: ['<meta charset="utf-8" />'],
      stream: emptyStream(),
    })
    const renderer = makeRenderer({ rootView: '', ssr: ssrOption })

    await renderer.render(createPage('Notes/Index'), 200, ['<title>X</title>'])

    const [, headArg] = (mockTemplate.renderStream as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(headArg).toEqual(['<meta charset="utf-8" />', '<title>X</title>'])
  })

  it('passes extraHead to the client-only shell and preserves the status', async () => {
    const renderer = makeRenderer({ rootView: '' })

    const response = await renderer.render(createPage('Notes/Index'), 404, ['<title>X</title>'])

    expect(mockTemplate.renderClientOnly).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'Notes/Index' }),
      ['<title>X</title>'],
    )
    expect(response.status).toBe(404)
  })
})
