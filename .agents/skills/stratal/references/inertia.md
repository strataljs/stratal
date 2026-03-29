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
        bundle: () => import('./ssr-bundle'),     // SSR bundle (async import)
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
    ssr: { bundle: () => import('./ssr-bundle') },
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
- `routes?` — `boolean` — When `true`, serializes all named routes and injects them as a `routes` shared prop for client-side URL generation with `useRoute()`
- `manifest?` — Vite manifest object for asset resolution
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
- `options`: `{ encryptHistory?, clearHistory?, preserveFragment? }` (all optional)

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

export default function UserProfile({ user }) {
  const { route, current } = useRoute()

  return (
    <nav>
      <a href={route('users.index')}>All Users</a>
      <a href={route('users.show', { id: user.id })}>
        {user.name}
      </a>
      {current('users.show') && <span>Currently viewing</span>}
    </nav>
  )
}
```

`route(name, params?)` mirrors the server-side `route()` function. Route names and params are type-safe when `StratalRouteMap` is augmented via `npx quarry route:types`.

`current(name?)` checks the current page URL against a route name. Without arguments, returns the current route name (or `undefined`).

## SSR

### Configuration

```typescript
ssr: {
  bundle: () => import('./ssr-bundle'),    // Dynamic import of SSR bundle
  disabled: ['admin/*', 'settings/*'],     // Glob patterns to skip SSR
}
```

### Per-Route SSR Opt-Out

```typescript
async show(ctx: RouterContext): Promise<Response> {
  ctx.withoutSsr()  // Skip SSR for this specific render
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

```bash
# Start development server with hot reload
npx quarry inertia:dev

# Production build via Vite
npx quarry inertia:build

# Generate TypeScript types for Inertia pages
npx quarry inertia:types

# Scaffold Inertia project structure
npx quarry inertia:install
```

## Vite Integration

```typescript
// vite.config.ts
import { createViteConfig } from '@stratal/inertia/vite'

export default createViteConfig({
  // Stratal-preconfigured Vite setup
  // Includes InertiaTypesPlugin and InertiaCssPlugin
})
```

## Sub-Path Imports

- `@stratal/inertia` — Main module, service, decorators, flash stores, types
- `@stratal/inertia/vite` — Vite configuration and plugins
- `@stratal/inertia/react` — React hooks (`useI18n`, `useRoute`)
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
import 'reflect-metadata'
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
