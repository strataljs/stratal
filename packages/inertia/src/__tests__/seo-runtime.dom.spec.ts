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

  it('clears managed tags when a page has no seo', () => {
    navigate({ seo: { description: 'x' } })
    navigate({})

    expect(document.head.querySelector('[data-seo]')).toBeNull()
  })
})
