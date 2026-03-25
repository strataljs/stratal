# Inertia.js Integration

`@stratal/inertia` is a separate package that adds Inertia.js v3 server-side support to Stratal. It enables server-driven React SPAs with SSR on Cloudflare Workers.

## Setup

```bash
yarn add @stratal/inertia
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
- `@stratal/inertia/react` — React hooks (`useI18n`)
