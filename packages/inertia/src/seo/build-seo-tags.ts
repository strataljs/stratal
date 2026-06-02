import type { SeoData, SeoTagDescriptor } from './types'

/**
 * Marker attribute stamped on every SEO-managed head element. The server emits
 * it on injected tags and the client head-sync runtime uses it to find and
 * reconcile the same tags across SPA navigations.
 */
export const DATA_SEO_ATTR = 'data-seo'

/**
 * Maps resolved {@link SeoData} into a flat list of {@link SeoTagDescriptor}s.
 *
 * Pure and framework-free: used server-side to render HTML strings and
 * client-side to build DOM nodes, so the two never drift. Every descriptor
 * carries the {@link DATA_SEO_ATTR} marker.
 */
export function buildSeoTags(data: SeoData): SeoTagDescriptor[] {
  const tags: SeoTagDescriptor[] = []

  if (data.title != null) {
    tags.push({ tag: 'title', attrs: {}, content: data.title })
  }

  meta(tags, { name: 'description' }, data.description)
  meta(tags, { name: 'keywords' }, Array.isArray(data.keywords) ? data.keywords.join(', ') : data.keywords)
  meta(tags, { name: 'author' }, data.author)
  meta(tags, { name: 'robots' }, data.robots)

  if (data.canonical != null) {
    tags.push({ tag: 'link', attrs: { rel: 'canonical', href: data.canonical } })
  }

  const og = data.openGraph
  if (og) {
    metaProp(tags, 'og:title', og.title)
    metaProp(tags, 'og:description', og.description)
    metaProp(tags, 'og:image', og.image)
    metaProp(tags, 'og:type', og.type)
    metaProp(tags, 'og:url', og.url)
    metaProp(tags, 'og:site_name', og.siteName)
  }

  const tw = data.twitter
  if (tw) {
    meta(tags, { name: 'twitter:card' }, tw.card)
    meta(tags, { name: 'twitter:title' }, tw.title)
    meta(tags, { name: 'twitter:description' }, tw.description)
    meta(tags, { name: 'twitter:image' }, tw.image)
    meta(tags, { name: 'twitter:site' }, tw.site)
    meta(tags, { name: 'twitter:creator' }, tw.creator)
  }

  if (data.meta) {
    for (const entry of data.meta) {
      const attrs: Record<string, string> = {}
      if (entry.name != null) attrs.name = entry.name
      if (entry.property != null) attrs.property = entry.property
      attrs.content = entry.content
      tags.push({ tag: 'meta', attrs })
    }
  }

  if (data.link) {
    for (const entry of data.link) {
      const attrs: Record<string, string> = {}
      // Custom link entries carry arbitrary keys; drop any whose name isn't a
      // valid attribute so a crafted key can't break out of the tag (server) or
      // throw from `setAttribute` (client head-sync).
      for (const [key, value] of Object.entries(entry)) {
        if (VALID_ATTR_NAME.test(key)) attrs[key] = value
      }
      tags.push({ tag: 'link', attrs })
    }
  }

  // Stamp the marker on every descriptor.
  for (const t of tags) {
    t.attrs[DATA_SEO_ATTR] = ''
  }

  return tags
}

/**
 * Valid HTML attribute name. Used to drop any attribute whose name (e.g. a key
 * spread from a user-supplied custom `meta`/`link` entry) could otherwise break
 * out of the tag and inject markup — attribute values are escaped, but names are
 * emitted verbatim, so an unsafe name like `x onload=…` must be rejected.
 */
const VALID_ATTR_NAME = /^[A-Za-z_:][\w.:-]*$/

/** Renders a descriptor to an HTML string with attribute/text escaping (server-side). */
export function descriptorToHtml(d: SeoTagDescriptor): string {
  const attrs = Object.entries(d.attrs)
    .filter(([key]) => VALID_ATTR_NAME.test(key))
    .map(([key, value]) => (value === '' ? key : `${key}="${escapeAttr(value)}"`))
    .join(' ')
  const open = attrs ? `${d.tag} ${attrs}` : d.tag

  if (d.tag === 'title') {
    return `<title ${attrs}>${escapeText(d.content ?? '')}</title>`
  }
  return `<${open} />`
}

function meta(tags: SeoTagDescriptor[], attrs: Record<string, string>, content: string | undefined): void {
  if (content == null) return
  tags.push({ tag: 'meta', attrs: { ...attrs, content } })
}

function metaProp(tags: SeoTagDescriptor[], property: string, content: string | undefined): void {
  if (content == null) return
  tags.push({ tag: 'meta', attrs: { property, content } })
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
