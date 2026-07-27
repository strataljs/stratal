import { describe, expect, it } from 'vitest'
import { DATA_SEO_ATTR, buildSeoTags, descriptorToHtml } from '../seo/build-seo-tags'

describe('buildSeoTags', () => {
  it('maps the core scalar fields', () => {
    const tags = buildSeoTags({
      title: 'Dashboard',
      description: 'My dashboard',
      robots: 'noindex',
      author: 'Ada',
      keywords: ['a', 'b'],
      canonical: 'https://acme.test/dashboard',
    })

    expect(tags).toContainEqual({ tag: 'title', attrs: { [DATA_SEO_ATTR]: '' }, content: 'Dashboard' })
    expect(tags).toContainEqual({ tag: 'meta', attrs: { name: 'description', content: 'My dashboard', [DATA_SEO_ATTR]: '' } })
    expect(tags).toContainEqual({ tag: 'meta', attrs: { name: 'robots', content: 'noindex', [DATA_SEO_ATTR]: '' } })
    expect(tags).toContainEqual({ tag: 'meta', attrs: { name: 'author', content: 'Ada', [DATA_SEO_ATTR]: '' } })
    expect(tags).toContainEqual({ tag: 'meta', attrs: { name: 'keywords', content: 'a, b', [DATA_SEO_ATTR]: '' } })
    expect(tags).toContainEqual({ tag: 'link', attrs: { rel: 'canonical', href: 'https://acme.test/dashboard', [DATA_SEO_ATTR]: '' } })
  })

  it('maps Open Graph to property meta tags', () => {
    const tags = buildSeoTags({ openGraph: { title: 'OG Title', image: 'https://acme.test/og.png', siteName: 'Acme' } })

    expect(tags).toContainEqual({ tag: 'meta', attrs: { property: 'og:title', content: 'OG Title', [DATA_SEO_ATTR]: '' } })
    expect(tags).toContainEqual({ tag: 'meta', attrs: { property: 'og:image', content: 'https://acme.test/og.png', [DATA_SEO_ATTR]: '' } })
    expect(tags).toContainEqual({ tag: 'meta', attrs: { property: 'og:site_name', content: 'Acme', [DATA_SEO_ATTR]: '' } })
  })

  it('maps Twitter card to name meta tags', () => {
    const tags = buildSeoTags({ twitter: { card: 'summary_large_image', site: '@acme' } })

    expect(tags).toContainEqual({ tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image', [DATA_SEO_ATTR]: '' } })
    expect(tags).toContainEqual({ tag: 'meta', attrs: { name: 'twitter:site', content: '@acme', [DATA_SEO_ATTR]: '' } })
  })

  it('passes through custom meta and link tags', () => {
    const tags = buildSeoTags({
      meta: [{ name: 'theme-color', content: '#000' }],
      link: [{ rel: 'icon', href: '/favicon.ico' }],
    })

    expect(tags).toContainEqual({ tag: 'meta', attrs: { name: 'theme-color', content: '#000', [DATA_SEO_ATTR]: '' } })
    expect(tags).toContainEqual({ tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', [DATA_SEO_ATTR]: '' } })
  })

  it('omits fields that are not set', () => {
    expect(buildSeoTags({})).toEqual([])
  })
})

describe('descriptorToHtml', () => {
  it('renders the marker as a boolean attribute and escapes values', () => {
    expect(descriptorToHtml({ tag: 'meta', attrs: { name: 'description', content: 'a & "b"', [DATA_SEO_ATTR]: '' } }))
      .toBe('<meta name="description" content="a &amp; &quot;b&quot;" data-seo />')
  })

  it('renders a title element with escaped text', () => {
    expect(descriptorToHtml({ tag: 'title', attrs: { [DATA_SEO_ATTR]: '' }, content: 'A < B' }))
      .toBe('<title data-seo>A &lt; B</title>')
  })

  it('renders a self-closing link element', () => {
    expect(descriptorToHtml({ tag: 'link', attrs: { rel: 'canonical', href: '/x', [DATA_SEO_ATTR]: '' } }))
      .toBe('<link rel="canonical" href="/x" data-seo />')
  })

  it('drops attributes with unsafe names (no tag breakout)', () => {
    const html = descriptorToHtml({
      tag: 'link',
      attrs: { 'rel': 'icon', 'href': '/x', 'onload=alert(1) x': 'y', [DATA_SEO_ATTR]: '' },
    })
    expect(html).toBe('<link rel="icon" href="/x" data-seo />')
    expect(html).not.toContain('onload')
  })
})

describe('buildSeoTags — custom link attribute hardening', () => {
  it('drops unsafe attribute names from custom link entries', () => {
    const tags = buildSeoTags({ link: [{ 'rel': 'amphtml', 'href': '/amp', 'x onerror=alert(1)': 'boom' }] })
    const link = tags.find((t) => t.tag === 'link')!
    expect(link.attrs).toHaveProperty('rel', 'amphtml')
    expect(link.attrs).toHaveProperty('href', '/amp')
    expect(Object.keys(link.attrs)).not.toContain('x onerror=alert(1)')
  })
})
