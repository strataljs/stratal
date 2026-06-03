import { describe, expect, it, vi } from 'vitest'
import type { Page } from '@inertiajs/core'
import type { InertiaModuleOptions } from '../inertia.options'
import { SsrRendererService } from '../services/ssr-renderer.service'
import type { InertiaSsrBundle, InertiaSsrResult } from '../types'

function createPage(): Page {
  return {
    component: 'Home',
    props: { errors: {} },
    url: '/',
    version: null,
    flash: {},
    rememberedState: {},
    rescuedProps: [],
  }
}

function emptyResult(): InertiaSsrResult {
  return { head: [], stream: new ReadableStream<Uint8Array>({ start: (c) => c.close() }) }
}

function createService(ssr: InertiaModuleOptions['ssr']): SsrRendererService {
  return new (SsrRendererService as any)({ rootView: '', ssr })
}

describe('SsrRendererService', () => {
  it('loads the SSR bundle once across multiple renders', async () => {
    const bundle: InertiaSsrBundle = { render: vi.fn().mockResolvedValue(emptyResult()) }
    const factory = vi.fn().mockResolvedValue(bundle)
    const service = createService({ bundle: factory })

    await service.render(createPage())
    await service.render(createPage())

    expect(factory).toHaveBeenCalledTimes(1)
    expect(bundle.render).toHaveBeenCalledTimes(2)
  })

  it('unwraps a default export', async () => {
    const bundle: InertiaSsrBundle = { render: vi.fn().mockResolvedValue(emptyResult()) }
    const service = createService({ bundle: vi.fn().mockResolvedValue({ default: bundle }) })

    await service.render(createPage())

    expect(bundle.render).toHaveBeenCalledOnce()
  })

  it('throws when SSR is not configured', async () => {
    const service = createService(undefined)
    await expect(service.render(createPage())).rejects.toThrow(/not configured/)
  })

  it('propagates a bundle-load failure (no silent fallback) and allows retry', async () => {
    const factory = vi.fn()
      .mockRejectedValueOnce(new Error('import failed'))
      .mockResolvedValueOnce({ render: vi.fn().mockResolvedValue(emptyResult()) })
    const service = createService({ bundle: factory })

    await expect(service.render(createPage())).rejects.toThrow('import failed')
    // A later request retries the import rather than reusing the rejected promise.
    await expect(service.render(createPage())).resolves.toBeDefined()
    expect(factory).toHaveBeenCalledTimes(2)
  })
})
