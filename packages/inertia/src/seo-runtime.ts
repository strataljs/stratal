/**
 * Client-side SEO head sync. Side-effect module: importing it registers a
 * single Inertia `navigate` listener that reconciles `document.head` from the
 * shared `seo` prop on every SPA visit.
 *
 * Consumers never import this directly — the `stratalInertia()` Vite plugin
 * injects it into the client entry, so backend `ctx.seo()` metadata stays in
 * sync across navigations with zero app wiring. The server still injects the
 * tags for the initial paint; this only runs on subsequent client visits.
 */
import { router } from '@inertiajs/core'
import { applySeoToHead } from './seo/apply-seo-to-head'
import type { SeoData } from './seo/types'

router.on('navigate', (event) => {
  const seo = (event.detail.page.props as { seo?: SeoData }).seo
  applySeoToHead(seo ?? {})
})
