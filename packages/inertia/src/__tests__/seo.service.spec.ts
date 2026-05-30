import { describe, expect, it } from 'vitest'
import type { RouterContext } from 'stratal/router'
import type { InertiaModuleOptions } from '../inertia.options'
import { SeoService } from '../services/seo.service'

function createService(options: Partial<InertiaModuleOptions> = {}): SeoService {
  return new (SeoService as any)({ rootView: '', ...options })
}

const ctx = {} as RouterContext

describe('SeoService', () => {
  it('returns an empty object when nothing is set', async () => {
    expect(await createService().resolve(ctx)).toEqual({})
  })

  it('merges defaults under the per-request data', async () => {
    const service = createService({ seo: { defaults: { description: 'default', robots: 'index' } } })
    service.set({ description: 'page' })

    expect(await service.resolve(ctx)).toEqual({ description: 'page', robots: 'index' })
  })

  it('deep-merges openGraph/twitter and concatenates meta/link', async () => {
    const service = createService({
      seo: { defaults: { openGraph: { siteName: 'Acme', image: 'd.png' }, meta: [{ name: 'a', content: '1' }] } },
    })
    service.set({ openGraph: { title: 'Page' }, twitter: { card: 'summary' }, meta: [{ name: 'b', content: '2' }] })

    expect(await service.resolve(ctx)).toEqual({
      openGraph: { siteName: 'Acme', image: 'd.png', title: 'Page' },
      twitter: { card: 'summary' },
      meta: [{ name: 'a', content: '1' }, { name: 'b', content: '2' }],
    })
  })

  it('accumulates across multiple set() calls', async () => {
    const service = createService()
    service.set({ title: 'A' })
    service.set({ description: 'B' })

    expect(await service.resolve(ctx)).toEqual({ title: 'A', description: 'B' })
  })

  describe('titleTemplate', () => {
    it('applies a string template to a page-provided title', async () => {
      const service = createService({ seo: { titleTemplate: '%s — Acme' } })
      service.set({ title: 'Dashboard' })

      expect((await service.resolve(ctx)).title).toBe('Dashboard — Acme')
    })

    it('does not wrap a bare default title', async () => {
      const service = createService({ seo: { defaults: { title: 'Acme' }, titleTemplate: '%s — Acme' } })

      expect((await service.resolve(ctx)).title).toBe('Acme')
    })

    it('applies a function template with the resolved title and ctx', async () => {
      const received: unknown[] = []
      const service = createService({
        seo: {
          titleTemplate: (title, c) => {
            received.push(title, c)
            return Promise.resolve(`${title}!`)
          },
        },
      })
      service.set({ title: 'Hi' })

      expect((await service.resolve(ctx)).title).toBe('Hi!')
      expect(received).toEqual(['Hi', ctx])
    })
  })

  it('resolves an async defaults function with ctx', async () => {
    const service = createService({
      seo: { defaults: () => Promise.resolve({ openGraph: { siteName: 'Dynamic' } }) },
    })
    service.set({ title: 'Page' })

    expect(await service.resolve(ctx)).toEqual({ title: 'Page', openGraph: { siteName: 'Dynamic' } })
  })

  it('renders resolved data to head-tag strings via tagsFor', async () => {
    const service = createService()
    service.set({ title: 'Home', description: 'Welcome' })
    const resolved = await service.resolve(ctx)

    expect(service.tagsFor(resolved)).toEqual([
      '<title data-seo>Home</title>',
      '<meta name="description" content="Welcome" data-seo />',
    ])
  })
})
