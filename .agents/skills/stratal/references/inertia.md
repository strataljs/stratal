# Inertia.js Integration

`@stratal/inertia` is a separate package that adds Inertia.js v3 server-side support to Stratal. It enables server-driven React SPAs with SSR on Cloudflare Workers.

## Setup

```bash
npm install @stratal/inertia
```

```typescript
import { InertiaModule, CookieFlashStore } from '@stratal/inertia'

@Module({
  imports: [
    InertiaModule.forRoot({
      rootView: 'app',                          // Root template name
      entryClientPath: 'src/inertia/app.tsx',    // Client entry (default)
      sharedData: {                              // Global shared props
        appName: 'My App',
        auth: (ctx) => ({ user: ctx.c.get('user') }),  // Resolver function
      },
      flash: {                                   // Flash messages
        store: new CookieFlashStore({ secret: env.FLASH_SECRET }),
      },
      i18n: { only: ['common', 'nav'] },         // Share translations with frontend
      ssr: {
        bundle: () => import('./inertia/ssr'),     // SSR bundle (async import)
        disabled: ['admin/*'],                    // Glob patterns to skip SSR
      },
    }),
  ],
})
export class AppModule {}
```

### Async Configuration

```typescript
InertiaModule.forRootAsync({
  inject: [CONFIG_TOKEN],
  useFactory: (config) => ({
    rootView: config.rootView,
    ssr: { bundle: () => import('./inertia/ssr') },
  }),
})
```

### Options

- `rootView` (required) — Root HTML template name
- `version?` — Asset version for cache busting (nullable)
- `ssr?` — `{ bundle: () => Promise<SsrModule>, disabled?: string[] }`
- `sharedData?` — Static values or `(ctx: RouterContext) => any` resolver functions
- `flash?` — `{ store: FlashStore }` — flash message storage (use `CookieFlashStore`)
- `i18n?` — `{ only?: string[] }` — share backend translations with frontend
- `routes?` — `boolean` — When `true`, serializes all named routes and injects them as a `routes` shared prop for client-side URL generation with `useRoute()`. The configured `trailingSlash` mode (from the `Stratal` constructor) is also forwarded as a `trailingSlash` shared prop so `useRoute()` produces canonical URLs that match the server. Also injects a `route: { name, params, defaults }` shared prop so `useRoute()` knows the current match. Sticky params set on the server via `Uri.defaults()` come through as `defaults` and are auto-applied by `route(name, params?)` on the client.
- `seo?` — `{ defaults?, titleTemplate? }` — app-wide SEO defaults and title template for backend-driven page metadata (`ctx.seo()`). See [SEO](#seo).
- `entryClientPath?` — Client entry point (default: `src/inertia/app.tsx`)

## Rendering Pages

Use `ctx.inertia()` in controller methods to render Inertia pages:

```typescript
@Controller('/notes')
export class NotesController {
  constructor(@inject(NotesService) private service: NotesService) {}

  @InertiaGet('/')
  async index(ctx: RouterContext): Promise<Response> {
    const notes = await this.service.list()
    return ctx.inertia('notes/Index', { notes })
  }

  @InertiaGet('/:id', { params: z.object({ id: z.string().uuid() }) })
  async show(ctx: RouterContext): Promise<Response> {
    const note = await this.service.findById(ctx.param('id'))
    return ctx.inertia('notes/Show', { note })
  }

  @InertiaPost('/', { body: createNoteSchema })
  async create(ctx: RouterContext): Promise<Response> {
    await this.service.create(ctx.body())
    return ctx.redirect('/notes')
  }

  @InertiaDelete('/:id', { params: z.object({ id: z.string() }) })
  async destroy(ctx: RouterContext): Promise<Response> {
    await this.service.delete(ctx.param('id'))
    return ctx.redirect('/notes')
  }

  @Get('/export')  // Regular non-Inertia route in the same controller
  export(ctx: RouterContext) {
    return ctx.redirect('https://example.com/export')
  }
}
```

`ctx.inertia(component, props?, options?)`:
- First request: returns full HTML page with SSR
- Subsequent Inertia requests (`X-Inertia` header): returns JSON page object
- `options`: `{ encryptHistory?, clearHistory?, preserveFragment?, status? }` (all optional). `status` defaults to `200`; set it to return a non-200 response (useful for hand-rendered error pages).

## Error Pages

`InertiaModule` auto-registers an `errorPage` callback on the `ExceptionHandler`. Any thrown error whose HTTP status is `S` renders the Inertia page `Errors/${S}` (e.g. `Errors/404`, `Errors/500`, `Errors/503`) with the response status set to `S`.

Convention: ship error components under your pages directory:

```
pages/Errors/404.tsx
pages/Errors/500.tsx
pages/Errors/503.tsx
```

The page receives `{ status, message, code }` as props:

```tsx
// pages/Errors/404.tsx
export default function NotFound({ status, message, code }: { status: number; message: string; code: number }) {
  return (
    <div>
      <h1>{status}</h1>
      <p>{message}</p>
    </div>
  )
}
```

Override per-status from `AppExceptionHandler.register()` — user `errorPage` callbacks run before the Inertia-supplied one and win:

```typescript
import { ExceptionHandler } from 'stratal/errors'

export class AppExceptionHandler extends ExceptionHandler {
  register(): void {
    this.errorPage((errorResponse, status, context) => {
      if (status === 503) return new Response(maintenanceHtml(), { status, headers: { 'content-type': 'text/html' } })
      // Return undefined to defer to Inertia's `Errors/${status}` renderer
    })
  }
}
```

## Inertia Decorators

Two routing patterns (never mix in one controller):

### Explicit Decorators

Specify HTTP method and path explicitly. Can be mixed with regular non-Inertia decorators (`@Get`, `@Post`, etc.) in the same controller.

```typescript
import { InertiaGet, InertiaPost, InertiaPut, InertiaPatch, InertiaDelete } from '@stratal/inertia'

@InertiaGet('/path', config?)
@InertiaPost('/path', config?)
@InertiaPut('/path', config?)
@InertiaPatch('/path', config?)
@InertiaDelete('/path', config?)
```

### Convention-Based (`@InertiaRoute`)

Works like core's `@Route()` — method names map to HTTP methods automatically: `index` -> GET, `show` -> GET /:id, `create` -> POST, `update` -> PUT /:id, `patch` -> PATCH /:id, `destroy` -> DELETE /:id.

```typescript
import { InertiaRoute } from '@stratal/inertia'

@Controller('/notes')
export class NotesController {
  @InertiaRoute()
  async index(ctx: RouterContext) { return ctx.inertia('notes/Index', { notes }) }

  @InertiaRoute({ params: z.object({ id: z.string() }) })
  async show(ctx: RouterContext) { return ctx.inertia('notes/Show', { note }) }

  @InertiaRoute({ body: createNoteSchema })
  async create(ctx: RouterContext) { ... }
}
```

### Decorator Config

All Inertia decorators accept: `query`, `params`, `body`, `tags`, `summary`, `description`, `security`, `hideFromDocs`.
They do NOT accept: `response`, `statusCode` (managed by Inertia).
All hide from OpenAPI docs by default (`hideFromDocs: true`).

## Prop Types

### Deferred Props

Lazy-loaded after initial page render. Group related props for batched loading:

```typescript
async index(ctx: RouterContext): Promise<Response> {
  return ctx.inertia('notes/Index', {
    notes: await this.service.list(),
    stats: ctx.defer(() => this.service.getStats()),           // Loaded after render
    analytics: ctx.defer(() => this.service.getAnalytics(), 'metrics'),  // Grouped
  })
}
```

- Deferred on full page load (client fetches separately)
- Resolved immediately on partial reload if requested

### Optional Props

Only included when explicitly requested via partial reload:

```typescript
return ctx.inertia('notes/Index', {
  notes: await this.service.list(),
  filters: ctx.optional(() => this.service.getFilters()),
})
```

### Once Props

Sent only on the first visit and cached for subsequent requests:

```typescript
return ctx.inertia('notes/Index', {
  notes: await this.service.list(),
  serverTime: ctx.once(() => Date.now()),
  config: ctx.once(() => loadConfig(), { key: 'app-config' }),                   // Custom cache key
  token: ctx.once(() => generateToken(), { expiresAt: Date.now() + 3600000 }),   // Expires in 1h
})
```

Options: `{ key?: string, expiresAt?: number | null }`

### Always Props

Always evaluated and included, even on partial reload requests:

```typescript
return ctx.inertia('notes/Index', {
  notes: await this.service.list(),
  csrfToken: ctx.always(() => generateCsrfToken()),
})
```

### Merge Props

Merged with existing client-side data on partial reload instead of replacing. Supports strategies:

```typescript
return ctx.inertia('notes/Index', {
  // Default: append to existing array
  notes: ctx.merge(() => this.service.list()),

  // Prepend to start of array
  notifications: ctx.merge(() => this.service.getNotifications(), { strategy: 'prepend' }),

  // Deep merge objects
  settings: ctx.merge(() => this.service.getSettings(), { strategy: 'deep' }),

  // Append with deduplication by key
  users: ctx.merge(() => this.service.getUsers(), { matchOn: 'id' }),
})
```

Strategies: `'append'` (default), `'prepend'`, `'deep'`. Use `matchOn` to deduplicate array items by a key field.

## Shared Data

Shared data is available on every Inertia page. Configure in module options:

```typescript
InertiaModule.forRoot({
  rootView: 'app',
  sharedData: {
    appName: 'My App',                          // Static value
    auth: (ctx) => ({                           // Resolver (receives RouterContext)
      user: ctx.c.get('user'),
      isAuthenticated: !!ctx.c.get('user'),
    }),
  },
})
```

Resolvers are called per-request. Static values are shared across all requests.

### Per-request sharing with `ctx.share`

From middleware or a controller, add a shared prop for the current request with `ctx.share(key, value)`. It is merged into every Inertia page rendered during that request — useful for contributing data without passing it through each controller.

```typescript
ctx.share('featureFlags', { 'new-checkout': true })
```

## Flash Messages

Flash data is stored between requests and automatically shared as Inertia props via the `flash` object.

### Setup

```typescript
import { InertiaModule, CookieFlashStore } from '@stratal/inertia'

InertiaModule.forRoot({
  rootView: 'app',
  flash: {
    store: new CookieFlashStore({
      secret: env.FLASH_SECRET,         // Required: signing secret
      cookie: 'stratal_flash',           // Optional: cookie name (default)
      cookieOptions: { sameSite: 'Lax' }, // Optional: cookie options
    }),
  },
})
```

### Setting Flash Data

Use `ctx.flash(key, value)` in controller methods:

```typescript
@InertiaPost('/')
async create(ctx: RouterContext): Promise<Response> {
  await this.service.create(ctx.body())
  ctx.flash('success', 'Note created successfully')
  return ctx.redirect('/notes')
}
```

Flash data is available on the next Inertia visit in the page `flash` object.

### Custom Flash Stores

Implement `FlashStore` for custom storage backends (e.g., KV, session):

```typescript
import type { FlashStore } from '@stratal/inertia'

export class KvFlashStore implements FlashStore {
  async read(ctx: RouterContext): Promise<Record<string, unknown>> { ... }
  async write(ctx: RouterContext, data: Record<string, unknown>): Promise<void> { ... }
  async clear(ctx: RouterContext): Promise<void> { ... }
}
```

## I18n Integration

Share backend translation messages with your React frontend automatically.

### Setup

Add the `i18n` option to `InertiaModule.forRoot()`:

```typescript
InertiaModule.forRoot({
  rootView: 'app',
  i18n: { only: ['common', 'nav'] },  // Only share specific namespaces
})
```

When `i18n` is set, the module auto-injects `locale` (string) and `translations` (flattened messages) as shared props on every page response.

### Frontend Usage

Use the `useI18n()` hook from `@stratal/inertia/react`:

```tsx
import { useI18n } from '@stratal/inertia/react'

export default function Header() {
  const { t, locale } = useI18n()

  return (
    <header>
      <h1>{t('common.title')}</h1>
      <p>{t('common.greeting', { name: 'World' })}</p>
      <span>Locale: {locale}</span>
    </header>
  )
}
```

`t(key, params?)` works identically to `I18nService.t()` on the backend.

### Filtering Namespaces

Use `only` to limit which message namespaces are sent to the frontend (reduces payload):

```typescript
i18n: { only: ['common', 'nav'] }           // Top-level namespaces
i18n: { only: ['common.actions'] }           // Nested prefix
i18n: {}                                      // All messages (omit only)
```

### Hreflang Link Tags (Automatic)

When i18n detection uses `path` or `querystring` and at least two locales are configured, Inertia auto-emits `<link rel="alternate" hreflang="…" href="…" />` tags for every locale plus an `x-default`. URLs honor the app-wide `trailingSlash` mode. No configuration knob — if your i18n setup produces URL-distinct locale variants, the tags appear.

These ride the [SEO](#seo) pipeline: they're injected into `<head>` on the initial render and re-synced on every Inertia client navigation, so the alternates always point at the current URL (no stale links after an SPA visit).

Path strategy (`locales: ['en', 'fr']`, `defaultLocale: 'en'`, `prefixDefaultLocale: false`) on `/users`:

```html
<link rel="alternate" hreflang="en" href="https://example.com/users" />
<link rel="alternate" hreflang="fr" href="https://example.com/fr/users" />
<link rel="alternate" hreflang="x-default" href="https://example.com/users" />
```

Querystring strategy (same locales) on `/users`:

```html
<link rel="alternate" hreflang="en" href="https://example.com/users" />
<link rel="alternate" hreflang="fr" href="https://example.com/users?locale=fr" />
<link rel="alternate" hreflang="x-default" href="https://example.com/users" />
```

Cookie/header strategies emit nothing — those don't have URL-distinct locale variants.

## SEO

Set page metadata (title, description, Open Graph, Twitter, etc.) from the backend. The module injects the tags into `<head>` for the initial response (works with and without SSR), shares the resolved metadata as a `seo` prop, and keeps `document.head` in sync across client-side navigations automatically (the `stratalInertia()` Vite plugin injects a head-sync runtime into the client bundle — no app wiring).

### Set metadata with `ctx.seo()`

Call `ctx.seo(data)` in a controller (or middleware) before returning the page. Multiple calls merge:

```typescript
@InertiaGet('/:slug')
async show(ctx: RouterContext): Promise<Response> {
  const post = await this.service.bySlug(ctx.param('slug'))
  ctx.seo({
    title: post.title,
    description: post.excerpt,
    canonical: `https://acme.app/blog/${post.slug}`,
    robots: 'index, follow',
    keywords: ['blog', post.category],
    author: post.author.name,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      image: post.coverUrl,
      type: 'article',
      url: `https://acme.app/blog/${post.slug}`,
      siteName: 'Acme',
    },
    twitter: { card: 'summary_large_image', site: '@acme', image: post.coverUrl },
    meta: [{ name: 'theme-color', content: '#0b0b0b' }],   // arbitrary custom <meta>
    link: [{ rel: 'amphtml', href: `https://acme.app/amp/${post.slug}` }],  // arbitrary custom <link>
  })
  return ctx.inertia('Blog/Show', { post })
}
```

All `SeoData` fields are optional: `title`, `description`, `canonical`, `robots`, `keywords` (string | string[]), `author`, `openGraph`, `twitter`, `meta` (custom), `link` (custom).

### App-wide defaults + title template

Configure `seo` in `InertiaModule.forRoot()`. Per-page `ctx.seo()` values merge over `defaults` (`openGraph`/`twitter` deep-merge, `meta`/`link` concatenate):

```typescript
InertiaModule.forRoot({
  rootView: 'app',
  seo: {
    defaults: { openGraph: { siteName: 'Acme' }, twitter: { card: 'summary_large_image' } },
    titleTemplate: '%s — Acme',   // page title 'Dashboard' → '<title>Dashboard — Acme</title>'
  },
})
```

`titleTemplate` (string) wraps a page-provided title via `%s`; a bare default title is used as-is. Both `defaults` and `titleTemplate` also accept a `ctx`-aware (optionally async) resolver for personalization from the database or elsewhere:

```typescript
seo: {
  defaults: async (ctx) => ({ openGraph: { siteName: (await ctx.user()).orgName } }),
  titleTemplate: async (title, ctx) => `${title} — ${(await ctx.user()).name}'s Workspace`,
}
```

The resolved `title` is always a string — it falls back to `''` when no page or default title applies (and even if a `titleTemplate` function returns `undefined`). This keeps client navigation deterministic: moving to a page with no SEO resets `document.title` (to your default or empty) instead of leaving the previous page's title behind. Set a `defaults.title` to control the fallback shown on such pages.

### Frontend: head sync is automatic

Server injection covers the first paint and crawlers. Client-side navigation updates are wired automatically — no app code: the `stratalInertia()` Vite plugin injects a runtime into the client entry that listens for Inertia `navigate` events and reconciles `document.head` from the shared `seo` prop. There is nothing to mount in `app.tsx`.

The `seo` prop is shared on **every** response — including partial reloads that don't request it — so a partial reload (e.g. polling one prop) never drops `seo` and never wipes the managed head tags. The client runtime only reconciles `document.head` when the `seo` key is actually present on the page.

Optionally, read the resolved metadata inside a component with `useSeo()` from `@stratal/inertia/react`:

```tsx
import { useSeo } from '@stratal/inertia/react'

function DebugSeo() {
  const seo = useSeo()
  return <pre>{seo.title}</pre>
}
```

## Client-Side URL Generation (useRoute)

Share named routes with the frontend for Ziggy-like URL building in React components.

### Setup

Enable the `routes` option in `InertiaModule.forRoot()`:

```typescript
InertiaModule.forRoot({
  rootView: 'app',
  routes: true,  // Serialize named routes as shared prop
})
```

### Frontend Usage

Use the `useRoute()` hook from `@stratal/inertia/react`:

```tsx
import { useRoute } from '@stratal/inertia/react'

export default function UserNav({ user }) {
  const { route, current, currentRoute, params } = useRoute()

  return (
    <nav>
      <a href={route('users.show', { id: user.id })}>{user.name}</a>
      {current('users.*') && <span>On a users page</span>}
      {currentRoute.name === 'users.show' && <span>#{currentRoute.params.id}</span>}
    </nav>
  )
}
```

- `route(name, params?)` — explicit params override carryover (filtered to params the target route declares) over sticky `defaults`. Sticky `defaults` come from `Uri.defaults()` set on the server (e.g. in middleware).
- `current()` → `RouteName | null`. `current('users.show')` → `boolean`. `current('users.*')` → `boolean` (wildcard prefix match against the matched route name).
- `currentRoute` is discriminated by `name`. Narrow on it for typed `params`. `params` is shorthand for `currentRoute.params`.
- Argument types come from `StratalRouteMap`. Run `npx quarry route:types` to populate it.

### Standalone helpers

For non-React callers (utility modules, framework code), `@stratal/inertia/react` exports pure helpers that mirror the hook's behaviour without React:

```tsx
import { applyTrailingSlash, matchCurrent, resolveUrl } from '@stratal/inertia/react'

// Apply server's trailing-slash mode (also exposed via the shared prop).
applyTrailingSlash('/users', 'always')               // → '/users/'

// Pure forms of useRoute().current() / .route().
matchCurrent(currentRoute, 'users.*')                 // → boolean
resolveUrl('users.show', { id }, routes, currentRoute, trailingSlash)
```

## SSR

SSR is **streamed** (React 19 `renderToReadableStream`): the document shell (server
SEO + Vite CSS) flushes immediately and the app body streams progressively, lowering
TTFB. There is **no client-side fallback** — if the SSR bundle fails to load or render,
the error surfaces (500) rather than silently degrading.

### Configuration

```typescript
ssr: {
  bundle: () => import('./inertia/ssr'),   // Dynamic import of the streaming SSR bundle
  disabled: ['admin/*', 'settings/*'],     // Glob patterns to skip SSR (buffered client-only render)
}
```

### The SSR bundle (`src/inertia/ssr.tsx`)

Use `createInertiaSsrApp` from `@stratal/inertia/ssr` — it wires Inertia's `App`,
head collection, and `renderToReadableStream`, returning the `render(page)` the module
expects. `quarry inertia:install` scaffolds this file.

```tsx
import { createInertiaSsrApp } from '@stratal/inertia/ssr'

export const { render } = createInertiaSsrApp({
  resolve: async (name) => {
    const pages = import.meta.glob('./pages/**/*.tsx')
    const page = await pages[`./pages/${name}.tsx`]?.()
    if (!page) throw new Error(`Page not found: ${name}`)
    return page
  },
  // Optional provider wrapper (theme, store, …):
  // setup: ({ App, props }) => <ThemeProvider><App {...props} /></ThemeProvider>,
})
```

> Inertia's `<Head>` tags are collected during the synchronous shell render. A `<Head>`
> inside a *suspended* boundary won't reach `<head>` — use server-side `ctx.seo()` for
> document metadata (the blessed path), which is resolved before render regardless.

### Per-Route SSR Opt-Out

```typescript
async show(ctx: RouterContext): Promise<Response> {
  ctx.withoutSsr()  // Skip SSR for this render (buffered client-only response)
  return ctx.inertia('notes/Show', { note })
}
```

## Type Safety

Augment the registries for type-safe page components and shared props:

```typescript
// src/types/inertia.d.ts
declare module '@stratal/inertia' {
  interface InertiaPageRegistry {
    'notes/Index': { notes: Note[] }
    'notes/Show': { note: Note }
    'notes/Create': {}
  }

  interface InertiaSharedProps {
    appName: string
    auth: { user: User | null; isAuthenticated: boolean }
  }
}
```

With augmentation, `ctx.inertia('notes/Index', { notes })` is fully type-checked.

## Inertia CLI Commands

Inertia CLI commands live in `InertiaQuarryModule` — import it from `@stratal/inertia/quarry` in your `src/quarry.ts`:

```typescript
import { QuarryRunner } from 'stratal/quarry/runner'
import { InertiaQuarryModule } from '@stratal/inertia/quarry'
import { AppModule } from './app.module'

export default QuarryRunner.run({
  imports: [AppModule, InertiaQuarryModule],
})
```

```bash
# Scaffold Inertia project structure (run once after install)
npx quarry inertia:install               # --skip-deps to skip the npm-install hint

# Start Vite dev server
npx quarry inertia:dev                   # --port=5173 --host --persist-to=.cf-state

# Production build via Vite (2-phase: browser bundle → worker bundle)
npx quarry inertia:build                 # --out-dir=dist --ssr

# Generate TypeScript types for Inertia pages
npx quarry inertia:types                 # --watch
```

Run `npx quarry help` for the top-level command list.

## Vite Integration

```typescript
// vite.config.ts
import { createViteConfig } from '@stratal/inertia/vite'

export default createViteConfig({
  // Stratal-preconfigured Vite setup
  // Includes InertiaTypesPlugin and InertiaCssPlugin
})
```

### `stratalInertia()` Plugin Options

The `stratalInertia()` Vite plugin (included in `createViteConfig`) accepts:

- `entries?` — Client entry paths for CSS collection (default: `['/src/inertia/app.tsx']`)
- `sourcemap?` — `boolean | 'dev-and-staging'` (default: `'dev-and-staging'`). When `'dev-and-staging'`, sourcemaps are emitted unless `CLOUDFLARE_ENV` is `'prod'` or `'production'`.
- `clientManifestPath?` — Path to the Vite client manifest from the browser-bundle build (default: `'dist/client/.vite/manifest.json'`)

## Sub-Path Imports

- `@stratal/inertia` — Main module, service, decorators, flash stores, types
- `@stratal/inertia/quarry` — CLI-only: `InertiaQuarryModule`, build/dev/types/install commands, `runTypeGeneration`
- `@stratal/inertia/vite` — Vite configuration and plugins
- `@stratal/inertia/react` — React hooks (`useI18n`, `useRoute`, `useSeo`)
- `@stratal/inertia/seo-runtime` — client SEO head-sync runtime; auto-injected into the client entry by `stratalInertia()`, not imported manually
- `@stratal/inertia/testing` — Test response assertions for Inertia pages

## Precognition

Precognition allows frontends to validate forms server-side without submitting them. The `HandlePrecognitiveRequests` middleware is automatically registered by `InertiaModule`.

When a request includes the `Precognition: true` header:
- If validation passes, a `204 No Content` response is returned with `Precognition: true` and `Precognition-Success: true` headers
- If validation fails, a `422 Unprocessable Entity` response is returned with `Precognition: true` header and validation errors

No controller code changes needed — the middleware intercepts after schema validation.

## Testing

Import `@stratal/inertia/testing` in your test setup to augment `TestResponse` with Inertia-specific assertions.

### Setup

```typescript
// vitest.setup.ts
import '@stratal/inertia/testing'
```

### Making Inertia Test Requests

Send requests with the `X-Inertia` header to get JSON page responses (instead of full HTML):

```typescript
const response = await module.http
  .get('/notes')
  .withHeader('X-Inertia', 'true')
  .withHeader('X-Inertia-Version', '1')
  .send()

await response.assertInertia()
await response.assertInertiaComponent('notes/Index')
await response.assertInertiaProp('notes.0.title', 'My Note')
```

### Available Assertions

| Method | Description |
|--------|-------------|
| `assertInertia(callback?)` | Assert Inertia response. Optional callback receives page object. |
| `assertInertiaComponent(component)` | Assert component name. |
| `assertInertiaProp(path, expected)` | Assert prop at dot-path. |
| `assertInertiaPropExists(path)` / `assertInertiaPropMissing(path)` | Assert prop presence. |
| `assertInertiaUrl(url)` | Assert page URL. |
| `assertInertiaVersion(version)` | Assert asset version. |
| `assertInertiaFlash(key, value)` | Assert flash data. |
| `assertInertiaDeferredProp(prop, group)` | Assert deferred prop in group. |
| `assertInertiaMergeProp(prop)` | Assert merge prop. |
| `assertInertiaSharedProp(prop)` | Assert shared prop. |
| `assertSuccessfulPrecognition()` | Assert 204 response with Precognition headers. |
| `assertPrecognitionValidationErrors(errors?)` | Assert 422 with Precognition headers. Optionally assert error body. |

See `references/testing.md` for full examples of each assertion method.
