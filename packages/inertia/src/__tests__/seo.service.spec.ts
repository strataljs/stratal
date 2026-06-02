import { describe, expect, it } from 'vitest'
import type { RouterContext } from 'stratal/router'
import type { InertiaModuleOptions } from '../inertia.options'
import type { HreflangService } from '../services/hreflang.service'
import { SeoService } from '../services/seo.service'
import type { SeoLinkTag } from '../seo/types'

function createService(
  options: Partial<InertiaModuleOptions> = {},
  hreflangLinks: SeoLinkTag[] = [],
): SeoService {
  const hreflang = { buildLinks: () => hreflangLinks } as unknown as HreflangService
  return new (SeoService as any)({ rootView: '', ...options }, hreflang)
}

const ctx = { c: { req: { url: 'http://localhost/users' } } } as unknown as RouterContext

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

    it('treats $-sequences in the title literally and substitutes every %s', async () => {
      const service = createService({ seo: { titleTemplate: '%s — Acme (%s)' } })
      service.set({ title: 'Sale $5 & $& off' })

      expect((await service.resolve(ctx)).title).toBe('Sale $5 & $& off — Acme (Sale $5 & $& off)')
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

    it('leaves the title unset when the function returns undefined', async () => {
      const service = createService({
        seo: { titleTemplate: (title) => (title === 'skip' ? undefined : `${title} — Acme`) },
      })
      service.set({ title: 'skip' })

      expect((await service.resolve(ctx)).title).toBeUndefined()
    })
  })

  it('resolves an async defaults function with ctx', async () => {
    const service = createService({
      seo: { defaults: () => Promise.resolve({ openGraph: { siteName: 'Dynamic' } }) },
    })
    service.set({ title: 'Page' })

    expect(await service.resolve(ctx)).toEqual({ title: 'Page', openGraph: { siteName: 'Dynamic' } })
  })

  describe('hreflang', () => {
    const links: SeoLinkTag[] = [
      { rel: 'alternate', hreflang: 'en', href: 'http://localhost/users' },
      { rel: 'alternate', hreflang: 'fr', href: 'http://localhost/fr/users' },
      { rel: 'alternate', hreflang: 'x-default', href: 'http://localhost/users' },
    ]

    it('appends hreflang alternates to the resolved link array', async () => {
      const service = createService({}, links)

      expect((await service.resolve(ctx)).link).toEqual(links)
    })

    it('places hreflang links after user-supplied links', async () => {
      const userLink: SeoLinkTag = { rel: 'canonical', href: 'http://localhost/users' }
      const service = createService({}, links)
      service.set({ link: [userLink] })

      expect((await service.resolve(ctx)).link).toEqual([userLink, ...links])
    })

    it('adds no link array when no hreflang alternates apply', async () => {
      const service = createService({}, [])
      service.set({ title: 'Home' })

      expect((await service.resolve(ctx)).link).toBeUndefined()
    })
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
