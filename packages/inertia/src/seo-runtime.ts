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

// Guard against duplicate registration when the module is re-evaluated (e.g.
// dev-server HMR, or the runtime injected into more than one client entry).
const INSTALLED_KEY = '__stratalInertiaSeoInstalled'
const globalScope = globalThis as Record<string, unknown>

if (!globalScope[INSTALLED_KEY]) {
  globalScope[INSTALLED_KEY] = true
  router.on('navigate', (event) => {
    const props = event.detail.page.props as { seo?: SeoData }
    // The backend shares `seo` as an always-evaluated prop, so it is present on
    // every response — including partial reloads. Only reconcile the head when
    // the key is actually present; never act on a guessed-empty value, which
    // would wipe managed tags a partial reload didn't intend to touch.
    if (!('seo' in props)) return
    applySeoToHead(props.seo ?? {})
  })
}
