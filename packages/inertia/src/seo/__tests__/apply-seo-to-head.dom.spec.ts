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
})
