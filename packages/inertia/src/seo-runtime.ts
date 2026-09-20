/**
 * Client-side SEO head sync. Side-effect module: importing it registers Inertia
 * listeners that reconcile `document.head` from the shared `seo` prop on every
 * SPA visit.
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

  const reconcile = (page: { props: Record<string, unknown> }): void => {
    const props = page.props as { seo?: SeoData }
    // The backend shares `seo` as an always-evaluated prop, so it is present on
    // every response — including partial reloads. Only reconcile the head when
    // the key is actually present; never act on a guessed-empty value, which
    // would wipe managed tags a partial reload didn't intend to touch.
    if (!('seo' in props)) return
    applySeoToHead(props.seo ?? {})
  }

  // A history entry being entered — including Back and Forward, which fetch nothing and so
  // report no success of their own.
  router.on('navigate', (event) => reconcile(event.detail.page))

  // A visit that only changed the props of the component already on screen reports `success`
  // and no `navigate`. Closing a modal is exactly that: it lands on the page the level was
  // drawn over, which is already rendered — so on navigate alone the head kept the level's
  // title while the address had moved back to the page's. Reconciling is idempotent, so the
  // visits that fire both settle on the same head twice rather than fighting.
  router.on('success', (event) => reconcile(event.detail.page))
}
