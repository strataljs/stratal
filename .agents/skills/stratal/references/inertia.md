# Inertia.js Integration

`@stratal/inertia` is a separate package that adds Inertia.js v3 server-side support to Stratal. It enables server-driven React SPAs with SSR on Cloudflare Workers.

## Setup

```bash
yarn add @stratal/inertia
```

```typescript
import { InertiaModule } from '@stratal/inertia'

@Module({
  imports: [
    InertiaModule.forRoot({
      rootView: 'app',                          // Root template name
      entryClientPath: 'src/inertia/app.tsx',    // Client entry (default)
      sharedData: {                              // Global shared props
        appName: 'My App',
        auth: (ctx) => ({ user: ctx.c.get('user') }),  // Resolver function
      },
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
- `version?` — Asset version for cache busting
- `ssr?` — `{ bundle: () => Promise<SsrModule>, disabled?: string[] }`
- `sharedData?` — Static values or `(ctx: RouterContext) => any` resolver functions
- `manifest?` — Vite manifest object for asset resolution
- `entryClientPath?` — Client entry point (default: `src/inertia/app.tsx`)

## Rendering Pages

Use `ctx.inertia()` in controller methods to render Inertia pages:

```typescript
@Controller('/notes')
export class NotesController {
  constructor(@inject(NotesService) private service: NotesService) {}

  @InertiaRoute()
  async index(ctx: RouterContext): Promise<Response> {
    const notes = await this.service.list()
    return ctx.inertia('notes/Index', { notes })
  }

  @InertiaRoute({ params: z.object({ id: z.string().uuid() }) })
  async show(ctx: RouterContext): Promise<Response> {
    const note = await this.service.findById(ctx.param('id'))
    return ctx.inertia('notes/Show', { note })
  }
}
```

`ctx.inertia(component, props?, options?)`:
- First request: returns full HTML page with SSR
- Subsequent Inertia requests (`X-Inertia` header): returns JSON page object
- `options`: `{ encryptHistory?, clearHistory? }`

## @InertiaRoute Decorator

Replaces `@Route()` for Inertia pages. Hides routes from OpenAPI docs by default.

```typescript
@InertiaRoute()                              // No config needed for simple pages
@InertiaRoute({ hideFromDocs: false })       // Show in OpenAPI docs
@InertiaRoute({ query: paginationSchema })   // With query validation
@InertiaRoute({ params: z.object({ id: z.string() }) })  // With params
```

Accepts: `query`, `params`, `body`, `tags`, `summary`, `description`, `security`, `hideFromDocs`.
Does NOT accept: `response`, `statusCode` (managed by Inertia).

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

### Merge Props

Merged with existing props on partial reload instead of replacing:

```typescript
return ctx.inertia('notes/Index', {
  notes: ctx.merge(() => this.service.list()),
})
```

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
    flash: (ctx) => ctx.c.get('flash'),
  },
})
```

Resolvers are called per-request. Static values are shared across all requests.

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

- `@stratal/inertia` — Main module, service, decorators, types
- `@stratal/inertia/vite` — Vite configuration and plugins
