# @stratal/inertia

Inertia.js v3 server adapter for [Stratal](https://stratal.dev) — build server-driven React SPAs on Cloudflare Workers.

[![npm version](https://img.shields.io/npm/v/@stratal/inertia)](https://www.npmjs.com/package/@stratal/inertia)
[![CI](https://github.com/strataljs/stratal/actions/workflows/ci.yml/badge.svg)](https://github.com/strataljs/stratal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/strataljs/stratal/badge)](https://securityscorecards.dev/viewer/?uri=github.com/strataljs/stratal)
[![Known Vulnerabilities](https://snyk.io/test/github/strataljs/stratal/badge.svg)](https://snyk.io/test/github/strataljs/stratal)
[![npm downloads](https://img.shields.io/npm/dm/@stratal/inertia)](https://www.npmjs.com/package/@stratal/inertia)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@stratal/inertia)](https://bundlephobia.com/package/@stratal/inertia)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/strataljs/stratal/pulls)
[![GitHub stars](https://img.shields.io/github/stars/strataljs/stratal?style=social)](https://github.com/strataljs/stratal)

## Features

- **InertiaModule** — Drop-in Stratal module with `forRoot()` / `forRootAsync()` configuration
- **Streaming SSR** — React 19 `renderToReadableStream` streaming via `createInertiaSsrApp`
- **Shared Data** — Global shared props with static values or request-scoped resolvers, plus `ctx.share()` from middleware
- **Route Decorators** — `@InertiaRoute` and `@InertiaGet` / `@InertiaPost` / `@InertiaPut` / `@InertiaPatch` / `@InertiaDelete`
- **Partial Reloads** — `defer`, `optional`, `merge`, `once`, `always` and `scroll` props
- **Backend-driven SEO** — `ctx.seo()` with app-wide defaults and a title template; tags are injected into `<head>` and kept in sync across client navigations
- **i18n Sharing** — Auto-share backend messages as `locale` + `translations`, read with `useI18n()`
- **Named Routes** — Serialize named routes to the client for Ziggy-like URL generation with `useRoute()`
- **Flash Messages** — `ctx.flash()` with a pluggable store (cookie store included)
- **Vite Plugin** — `stratalInertia()` handles dev/build wiring, asset manifests, and SSR page exclusion
- **Quarry CLI** — `inertia:install`, `inertia:dev`, `inertia:build`, and `inertia:types`
- **Test Assertions** — `assertInertia()` and friends via `@stratal/inertia/testing`

## Installation

```bash
npm install @stratal/inertia
# or
yarn add @stratal/inertia
```

Then scaffold the frontend:

```bash
npx quarry inertia:install
```

### AI Agent Skills

Stratal provides [Agent Skills](https://agentskills.io) for AI coding assistants like Claude Code and Cursor. Install to give your AI agent knowledge of Stratal patterns, conventions, and APIs:

```bash
npx skills add strataljs/stratal
```

| Skill | Description |
|---|---|
| `stratal` | Build Cloudflare Workers apps with the Stratal framework — modules, DI, controllers, routing, OpenAPI, queues, cron, events, seeders, CLI, auth, database, access control, testing, and more |

## Quick Start

### Module setup

```typescript
import { Stratal } from 'stratal'
import { Module } from 'stratal/module'
import { InertiaModule } from '@stratal/inertia'

@Module({
  imports: [
    InertiaModule.forRoot({
      rootView: 'app',
      entryClientPath: 'src/inertia/app.tsx',
      sharedData: {
        appName: 'My App',
      },
    }),
  ],
})
class AppModule {}

export default new Stratal({ module: AppModule })
```

`rootView` is the only required option. The rest are optional: `version`, `ssr`, `flash`, `sharedData`, `i18n`, `routes`, `seo` and `entryClientPath` (defaults to `src/inertia/app.tsx`).

### Vite setup

```typescript
// vite.config.ts
import { stratalInertia } from '@stratal/inertia/vite'

export default defineConfig({
  plugins: [stratalInertia()],
})
```

### Controller with @InertiaRoute

```typescript
import { Controller, type RouterContext } from 'stratal/router'
import { InertiaRoute } from '@stratal/inertia'

@Controller('/notes')
export class NotesController {
  @InertiaRoute({ summary: 'List notes' })
  async index(ctx: RouterContext) {
    return ctx.inertia('notes/Index', { notes: [] })
  }
}
```

## Props

`InertiaModule` augments `RouterContext` with prop helpers that control what is sent and when:

```typescript
async index(ctx: RouterContext) {
  return ctx.inertia('notes/Index', {
    // Sent on every response
    notes: await this.notes.all(),

    // Resolved after the initial render, optionally in a named group
    stats: ctx.defer(() => this.notes.stats(), 'sidebar'),

    // Only when the client explicitly asks for it
    audit: ctx.optional(() => this.notes.audit()),

    // Merged into existing client-side data instead of replacing it
    feed: ctx.merge(() => this.notes.page(), { matchOn: 'id' }),

    // Sent once, then cached by the client
    countries: ctx.once(() => this.geo.countries()),

    // Always evaluated, even on a partial reload
    unread: ctx.always(() => this.notes.unreadCount()),

    // A merge prop that also publishes what <InfiniteScroll> needs
    items: ctx.scroll(() => this.notes.paginate()),
  })
}
```

`ctx.share(key, value)` adds a shared prop for the current request — useful from middleware — and `ctx.flash(key, value)` sets flash data for the next visit.

## SEO

Set `seo` on the module for app-wide defaults, then contribute per-page metadata from a controller. The resolved tags are injected into `<head>`, shared as the `seo` prop, and kept in sync across client navigations by the runtime the Vite plugin injects.

```typescript
InertiaModule.forRoot({
  rootView: 'app',
  seo: {
    defaults: { openGraph: { siteName: 'Acme' }, twitter: { card: 'summary_large_image' } },
    titleTemplate: '%s — Acme',
  },
})
```

```typescript
async show(ctx: RouterContext) {
  const note = await this.notes.find(ctx.param('id'))
  ctx.seo({ title: note.title, description: note.excerpt })
  return ctx.inertia('notes/Show', { note })
}
```

Read it in a component with `useSeo()` from `@stratal/inertia/react`.

## i18n and named routes

```typescript
InertiaModule.forRoot({
  rootView: 'app',
  i18n: { only: ['common', 'nav'] },  // shares `locale` + `translations`
  routes: true,                        // shares named routes
})
```

```tsx
import { useI18n, useRoute } from '@stratal/inertia/react'

const { t } = useI18n()
const { route, current } = useRoute()

<a href={route('notes.show', { id })} aria-current={current('notes.show') ? 'page' : undefined}>
  {t('common.view')}
</a>
```

## Streaming SSR

Enable SSR by pointing the module at a bundle that exports a streaming `render`:

```typescript
InertiaModule.forRoot({
  rootView: 'app',
  ssr: { bundle: () => import('./inertia/ssr') },
})
```

`src/inertia/ssr.tsx` (scaffolded by `quarry inertia:install`) uses `createInertiaSsrApp`, which wires Inertia's `App`, head collection, and React 19's `renderToReadableStream` — the shell flushes early and the body streams progressively:

```tsx
import { createInertiaSsrApp } from '@stratal/inertia/ssr'

export const { render } = createInertiaSsrApp({
  resolve: async (name) => {
    const pages = import.meta.glob('./pages/**/*.tsx')
    const page = await pages[`./pages/${name}.tsx`]?.()
    if (!page) throw new Error(`Page not found: ${name}`)
    return page
  },
})
```

There is no client-side fallback — an SSR failure surfaces as an error rather than silently degrading.

### Excluding pages from SSR

Heavy pages that don't need to be in first paint can skip the server entirely. Pass `ssrExclude` to the Vite plugin with page-component globs:

```typescript
stratalInertia({
  ssrExclude: ['Admin/**', 'Reports/Heavy'],
})
```

Patterns match Inertia component names (`*` matches one path segment, `**` matches any number). Excluded pages are dropped from the worker bundle entirely — a smaller cold start — and rendered client-only at runtime. The browser bundle still includes them, so they hydrate normally.

## Testing

```typescript
// vitest.setup.ts
import '@stratal/inertia/testing'  // augments TestResponse with Inertia assertions
```

```typescript
const response = await module.http
  .get('/notes')
  .withHeaders({ 'X-Inertia': 'true', 'X-Inertia-Version': '1' })
  .send()

await response.assertInertia()
```

## Quarry commands

| Command | Description |
|---|---|
| `inertia:install` | Scaffold Inertia.js files for a Stratal project |
| `inertia:dev` | Start the Inertia Vite development server |
| `inertia:build` | Build the Inertia frontend for production |
| `inertia:types` | Generate Inertia page type definitions |

## Documentation

Full guides and examples are available at **[stratal.dev](https://stratal.dev)**.

## Support the project

If Stratal is useful to you, **[star the repository](https://github.com/strataljs/stratal)** — it is the simplest way to help others find it.

## Maintainer

Built and maintained by **Temitayo Fadojutimi** — [@adesege_](https://x.com/adesege_).

## License

MIT
