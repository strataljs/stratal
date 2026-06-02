/// <reference lib="dom" />
import { beforeEach, describe, expect, it, vi } from 'vitest'

type NavigateHandler = (event: { detail: { page: { props: Record<string, unknown> } } }) => void

const handlers: Record<string, NavigateHandler> = {}
vi.mock('@inertiajs/core', () => ({
  router: {
    on: (type: string, cb: NavigateHandler) => {
      handlers[type] = cb
      return () => { /* unsubscribe — unused in tests */ }
    },
  },
}))

// Importing the runtime registers the navigate listener (side effect).
await import('../seo-runtime')

function navigate(props: Record<string, unknown>): void {
  handlers.navigate({ detail: { page: { props } } })
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.title = ''
})

describe('seo-runtime', () => {
  it('registers a navigate listener on import', () => {
    expect(typeof handlers.navigate).toBe('function')
  })

  it('applies the page seo prop to the head on navigation', () => {
    navigate({ seo: { title: 'Home', description: 'Welcome' } })

    expect(document.title).toBe('Home')
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Welcome')
  })

  it('reconciles between navigations without duplicates', () => {
    navigate({ seo: { title: 'A', description: 'first' } })
    navigate({ seo: { title: 'B', description: 'second' } })

    expect(document.title).toBe('B')
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1)
  })

  it('clears managed tags when navigating to a page whose seo prop is empty', () => {
    navigate({ seo: { description: 'x' } })
    // The backend always shares `seo`; an empty object means "no metadata".
    navigate({ seo: {} })

    expect(document.head.querySelector('[data-seo]')).toBeNull()
  })

  it('resets the title to the default and clears stale tags when navigating to a no-SEO page', () => {
    navigate({ seo: { title: 'Article', description: 'body' } })
    expect(document.title).toBe('Article')

    // The backend resolves an empty title to '' (the configured default fallback),
    // so the runtime must overwrite the previous page's title rather than leave it.
    navigate({ seo: { title: '' } })

    expect(document.title).toBe('')
    // Stale meta/link tags are cleared; the managed <title> remains (now empty,
    // still marked) so the title is always overwritten rather than left stale.
    expect(document.head.querySelector('meta[name="description"]')).toBeNull()
    expect(document.head.querySelector('link[data-seo]')).toBeNull()
    expect(document.head.querySelector('meta[data-seo]')).toBeNull()
    const title = document.head.querySelector('title[data-seo]')
    expect(title?.textContent).toBe('')
  })

  it('does not touch the head on a partial reload that omits the seo prop', () => {
    navigate({ seo: { title: 'Dashboard', description: 'stats' } })
    expect(document.title).toBe('Dashboard')

    // A partial reload that requests only some other prop omits `seo` entirely.
    // The runtime must leave the managed head untouched (no wipe).
    navigate({ message: 'partial update' })

    expect(document.title).toBe('Dashboard')
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('stats')
  })

  it('syncs hreflang alternates carried in the seo link array on navigation', () => {
    navigate({
      seo: {
        link: [
          { rel: 'alternate', hreflang: 'en', href: 'http://localhost/users' },
          { rel: 'alternate', hreflang: 'fr', href: 'http://localhost/fr/users' },
        ],
      },
    })

    const first = document.head.querySelectorAll('link[rel="alternate"][data-seo]')
    expect(first).toHaveLength(2)
    expect(first[1].getAttribute('hreflang')).toBe('fr')
    expect(first[1].getAttribute('href')).toBe('http://localhost/fr/users')

    // Navigating to a new URL replaces the alternates — no stale links remain.
    navigate({
      seo: {
        link: [
          { rel: 'alternate', hreflang: 'en', href: 'http://localhost/posts' },
          { rel: 'alternate', hreflang: 'fr', href: 'http://localhost/fr/posts' },
        ],
      },
    })

    const second = document.head.querySelectorAll('link[rel="alternate"][data-seo]')
    expect(second).toHaveLength(2)
    expect(second[0].getAttribute('href')).toBe('http://localhost/posts')
  })
})
