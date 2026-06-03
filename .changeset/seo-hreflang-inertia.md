---
"@stratal/inertia": patch
---

Add backend-driven SEO metadata management with hreflang and automatic client-side head synchronization

- Configure app-wide SEO defaults and a title template via `InertiaModule.forRoot({ seo: { ... } })`.
- Set per-page metadata from controllers or middleware with `ctx.seo({ ... })` — title, description, Open Graph, Twitter card, canonical URL, and arbitrary meta/link tags.
- Locale alternates (`rel="alternate" hreflang="…"`) are generated automatically for path-prefixed and querystring locale strategies and merged into the rendered tags.
- Server-rendered SEO tags are kept in sync with the document head across SPA navigations automatically — no app wiring required.
- New `useSeo()` React hook to read the resolved SEO data in components.
- New `@stratal/inertia/seo` entry point exporting SEO types and tag-building utilities.
- Fix: error responses for idempotent GET/HEAD navigations (e.g. deferred partial reloads) now render in place instead of using flash + redirect, preventing redirect loops.
