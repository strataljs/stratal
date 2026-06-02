/// <reference lib="dom" />
import { DATA_SEO_ATTR, buildSeoTags } from './build-seo-tags'
import type { SeoData } from './types'

/**
 * Reconciles `document.head` with the resolved SEO data (client-side).
 *
 * Removes only the previously managed `[data-seo]` tags and re-creates them
 * from {@link buildSeoTags}; the title is applied via `doc.title` so the single
 * `<title>` element is updated in place rather than duplicated, and the
 * {@link DATA_SEO_ATTR} marker is re-stamped on it so the next reconcile finds
 * and replaces it instead of leaving a stale title behind.
 *
 * Pure and DOM-only (no React) so it can be unit-tested under jsdom.
 */
export function applySeoToHead(seo: SeoData, doc: Document = document): void {
  const head = doc.head
  // Remove only previously SEO-managed tags; unmanaged head content is untouched.
  head.querySelectorAll(`[${DATA_SEO_ATTR}]`).forEach((el) => el.remove())

  for (const descriptor of buildSeoTags(seo)) {
    if (descriptor.tag === 'title') {
      // `doc.title` updates the single <title> in place. Re-stamp the marker so
      // the element is tracked as managed and replaced on the next navigation.
      doc.title = descriptor.content ?? ''
      doc.head.querySelector('title')?.setAttribute(DATA_SEO_ATTR, '')
      continue
    }
    const el = doc.createElement(descriptor.tag)
    for (const [key, value] of Object.entries(descriptor.attrs)) {
      // A single malformed attribute name must not abort the reconcile and
      // leave the head half-updated. `setAttribute` throws on invalid names,
      // so isolate each one and skip the offending attribute only.
      try {
        el.setAttribute(key, value)
      } catch {
        // Invalid attribute name — drop this attribute, keep building the tag.
      }
    }
    head.appendChild(el)
  }
}
