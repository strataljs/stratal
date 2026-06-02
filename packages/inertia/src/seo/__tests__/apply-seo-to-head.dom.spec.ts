/// <reference lib="dom" />
import { beforeEach, describe, expect, it } from 'vitest'
import { applySeoToHead } from '../apply-seo-to-head'

beforeEach(() => {
  document.head.innerHTML = ''
  document.title = ''
})

describe('applySeoToHead', () => {
  it('injects tags and sets the document title', () => {
    applySeoToHead({ title: 'Home', description: 'Welcome', canonical: '/home' })

    expect(document.title).toBe('Home')
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Welcome')
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('/home')
  })

  it('reconciles previously managed tags on the next call (no duplicates)', () => {
    applySeoToHead({ title: 'A', description: 'first' })
    applySeoToHead({ title: 'B', description: 'second' })

    expect(document.title).toBe('B')
    const descriptions = document.head.querySelectorAll('meta[name="description"]')
    expect(descriptions).toHaveLength(1)
    expect(descriptions[0].getAttribute('content')).toBe('second')
  })

  it('removes managed tags that are no longer present', () => {
    applySeoToHead({ description: 'gone' })
    applySeoToHead({})

    expect(document.head.querySelector('[data-seo]')).toBeNull()
  })

  it('leaves unmanaged head tags untouched', () => {
    const charset = document.createElement('meta')
    charset.setAttribute('charset', 'utf-8')
    document.head.appendChild(charset)

    applySeoToHead({ description: 'x' })
    applySeoToHead({ description: 'y' })

    expect(document.head.querySelector('meta[charset="utf-8"]')).not.toBeNull()
  })

  it('reconciles a server-injected [data-seo] title without duplicating it', () => {
    // Simulate the server's initial-paint title carrying the marker.
    const serverTitle = document.createElement('title')
    serverTitle.setAttribute('data-seo', '')
    serverTitle.textContent = 'Server'
    document.head.appendChild(serverTitle)

    applySeoToHead({ title: 'Client' })

    expect(document.querySelectorAll('title')).toHaveLength(1)
    expect(document.title).toBe('Client')
  })

  it('re-stamps the data-seo marker on the title after a client update', () => {
    // The title is set via `document.title` (text only), so the marker must be
    // re-applied; otherwise the next reconcile would not treat it as managed.
    applySeoToHead({ title: 'First' })
    const title = document.head.querySelector('title')
    expect(title?.hasAttribute('data-seo')).toBe(true)

    // Marker present means the next reconcile replaces, never duplicates.
    applySeoToHead({ title: 'Second' })
    expect(document.querySelectorAll('title')).toHaveLength(1)
    expect(document.title).toBe('Second')
  })

  it('sets an empty title deterministically when given an empty string', () => {
    applySeoToHead({ title: 'Previous' })
    expect(document.title).toBe('Previous')

    applySeoToHead({ title: '' })
    expect(document.title).toBe('')
  })

  it('skips only the offending attribute when a tag carries an invalid attribute name', () => {
    // A crafted custom link key survives buildSeoTags' name filter only if it
    // matches VALID_ATTR_NAME, but guard the client loop regardless: a single
    // bad setAttribute must not abort the whole reconcile mid-update.
    applySeoToHead({
      link: [
        { rel: 'canonical', href: '/a' },
        // Mix a valid and (server-stripped) hostile-looking key; the valid
        // attributes must still land on the element.
        { rel: 'alternate', href: '/b', hreflang: 'fr' },
      ],
      description: 'after the links',
    })

    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('/a')
    expect(document.head.querySelector('link[rel="alternate"]')?.getAttribute('hreflang')).toBe('fr')
    // The reconcile completed: tags after the links are present too.
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('after the links')
  })
})
