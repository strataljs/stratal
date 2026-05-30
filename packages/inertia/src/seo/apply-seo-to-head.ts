/// <reference lib="dom" />
import { DATA_SEO_ATTR, buildSeoTags } from './build-seo-tags'
import type { SeoData } from './types'

/**
 * Reconciles `document.head` with the resolved SEO data (client-side).
 *
 * Removes the previously managed `[data-seo]` tags and re-creates them from
 * {@link buildSeoTags}; the title is applied via `doc.title` so the single
 * `<title>` element is updated in place rather than duplicated.
 *
 * Pure and DOM-only (no React) so it can be unit-tested under jsdom.
 */
export function applySeoToHead(seo: SeoData, doc: Document = document): void {
  const head = doc.head
  head.querySelectorAll(`[${DATA_SEO_ATTR}]`).forEach((el) => el.remove())

  for (const descriptor of buildSeoTags(seo)) {
    if (descriptor.tag === 'title') {
      doc.title = descriptor.content ?? ''
      continue
    }
    const el = doc.createElement(descriptor.tag)
    for (const [key, value] of Object.entries(descriptor.attrs)) {
      el.setAttribute(key, value)
    }
    head.appendChild(el)
  }
}
