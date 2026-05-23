# Routing

## Controller Decorator

```typescript
import { Controller } from 'stratal/router'
import type { ControllerOptions } from 'stratal/router'

@Controller('/api/v1/notes', {
  tags: ['Notes'],              // OpenAPI tags
  security: ['bearerAuth'],     // Default security for all routes
  hideFromDocs: false,          // Hide all routes from OpenAPI docs
  version: '1',                 // API version (requires versioning config)
  name: 'notes.',               // Route name prefix for URL generation
  domain: '{tenant}.myapp.com', // Domain pattern for multi-tenant routing
})
export class NotesController { ... }
```

`@Controller()` auto-applies `@Transient()` — do not double-decorate.

## Convention-Based Routing (@Route)

Best suited for REST resource controllers. Method names auto-map to HTTP method + path + status code:

| Method     | HTTP   | Path              | Status |
|-----------|--------|-------------------|--------|
| `index()`  | GET    | `/base-path`      | 200    |
| `show()`   | GET    | `/base-path/:id`  | 200    |
| `create()` | POST   | `/base-path`      | 201    |
| `update()` | PUT    | `/base-path/:id`  | 200    |
| `patch()`  | PATCH  | `/base-path/:id`  | 200    |
| `destroy()`| DELETE | `/base-path/:id`  | 200    |

```typescript
import { Route } from 'stratal/router'
import { z } from 'stratal/validation'

@Route({
  body: createNoteSchema,               // Request body (POST/PUT/PATCH)
  params: z.object({ id: z.string() }), // URL parameters
  query: paginationSchema,              // Query parameters
  response: noteSchema,                 // Response schema (required)
  tags: ['Extra Tag'],                  // Merged with controller tags
  security: [],                         // Override: empty = public
  description: 'Create a note',
  summary: 'Creates a new note',
  hideFromDocs: false,
  name: 'notes.create',                 // Explicit route name (optional)
})
async create(ctx: RouterContext): Promise<Response> { ... }
```

## Explicit HTTP Method Decorators

Use when convention names don't fit. Cannot mix with `@Route()` in the same controller.

```typescript
import { Get, Post, Put, Patch, Delete, All } from 'stratal/router'
import { inject } from 'stratal/di'

@Controller('/api/v1/notes')
export class NotesController {
  @Get('/', { response: z.array(noteSchema), summary: 'List notes', name: 'notes.list' })
  async list(ctx: RouterContext) { ... }

  @Post('/', { body: createNoteSchema, response: noteSchema, statusCode: 201 })
  async createNote(ctx: RouterContext) { ... }

  @Get('/:id', {
    params: z.object({ id: z.string().uuid() }),
    response: noteSchema,
  })
  async getNote(ctx: RouterContext) { ... }

  @Put('/:id', {
    params: z.object({ id: z.string().uuid() }),
    body: updateNoteSchema,
    response: noteSchema,
  })
  async updateNote(ctx: RouterContext) { ... }

  @Delete('/:id', {
    params: z.object({ id: z.string().uuid() }),
    response: z.object({}),
  })
  async deleteNote(ctx: RouterContext) { ... }
}
```

## RouteConfig

```typescript
interface RouteConfig {
  body?: ZodType | { schema: ZodType; contentType?: string }
  params?: ZodObject | ZodPipe           // URL params
  query?: ZodObject | ZodPipe            // Query params
  response: ZodType | { schema: ZodType; description?: string; contentType?: string }
  tags?: string[]
  security?: SecurityScheme[]            // e.g., ['bearerAuth']
  description?: string
  summary?: string
  hideFromDocs?: boolean
  statusCode?: number                    // For HTTP method decorators only
  name?: string                          // Route name for URL generation
}
```

## RouterContext API

```typescript
class RouterContext {
  c: Context                             // Native Hono context
  json(data: object, status?: number): Response
  body<T>(): Promise<T>                  // Validated request body
  param(key: string): string             // URL param (e.g., :id)
  query(key?: string): Record | string   // Query params
  header(name: string): string | undefined
  getCookie(name: string): string | undefined       // Read cookie
  setCookie(name: string, value: string, options?: CookieOptions): void  // Set cookie
  deleteCookie(name: string, options?: CookieOptions): string | undefined // Delete cookie
  text(text: string, status?: number): Response
  html(html: string, status?: number): Response
  redirect(url: string, status?: number): Response
  stream(callback): Response             // Binary streaming
  streamText(callback): Response         // Text streaming (sets Content-Encoding: Identity)
  streamSSE(callback): Response          // Server-Sent Events
  getContainer(): Container              // Request-scoped DI container
  setLocale(locale: string): void
  getLocale(): string

  // URL generation
  route(name, params?, options?): string         // Generate URL from named route
  signedUrl(name, params?, options?): Promise<string>  // Generate signed URL
  hasValidSignature(): Promise<boolean>          // Verify current request signature
  domain(key: string): string                    // Get domain parameter value
}
```

## Named Routes

Routes can be named for URL generation. Convention-based routes auto-generate names from the controller path and method name.

### Auto-Generated Names (Convention Routing)

When using `@Route()`, names are derived from the controller base path + method:

```typescript
@Controller('/api/v1/notes')
export class NotesController {
  @Route({ response: z.array(noteSchema) })
  async index(ctx: RouterContext) { ... }   // name: "notes.index"

  @Route({ response: noteSchema })
  async show(ctx: RouterContext) { ... }    // name: "notes.show"

  @Route({ body: schema, response: noteSchema })
  async create(ctx: RouterContext) { ... }  // name: "notes.create"
}
```

### Custom Name Prefix

Set a name prefix on the controller — applied to all routes:

```typescript
@Controller('/api/v1/notes', { name: 'api.notes.' })
export class NotesController {
  @Route({ response: noteSchema })
  async show(ctx: RouterContext) { ... }    // name: "api.notes.show"
}
```

### Explicit Names

Override the auto-generated name on individual routes:

```typescript
@Get('/latest', { response: noteSchema, name: 'notes.latest' })
async getLatest(ctx: RouterContext) { ... }  // name: "notes.latest"
```

Run `npx quarry route:list` to see all registered route names.

### Filtering Routes

```bash
npx quarry route:list --method=GET       # Filter by HTTP method
npx quarry route:list --path=/users      # Filter by path substring
npx quarry route:list --name=users       # Filter by route name
npx quarry route:list --hidden           # Include hidden routes (excluded by default)
```

## URL Generation

### In Controllers (via RouterContext)

The simplest way to generate URLs from named routes:

```typescript
@Controller('/api/v1/notes', { name: 'notes.' })
export class NotesController {
  @Route({ response: noteSchema })
  async show(ctx: RouterContext) {
    const note = await this.service.findById(ctx.param('id'))

    // Generate URL to another route
    const editUrl = ctx.route('notes.update', { id: note.id })
    // -> '/api/v1/notes/123'

    // Extra params become query string
    const listUrl = ctx.route('notes.index', { page: '2', sort: 'title' })
    // -> '/api/v1/notes?page=2&sort=title'

    // Absolute URL (includes scheme + host)
    const absoluteUrl = ctx.route('notes.show', { id: note.id }, { absolute: true })
    // -> 'https://myapp.com/api/v1/notes/123'

    return ctx.json(note)
  }
}
```

### Standalone Function (Outside Controllers)

Use the `route()` function when you don't have access to `RouterContext` — works in services, event listeners, and other non-controller code:

```typescript
import { route } from 'stratal/router'

@Transient()
export class NotificationService {
  async sendNoteCreatedEmail(noteId: string) {
    const noteUrl = route('notes.show', { id: noteId })
    // -> '/api/v1/notes/123'

    await this.email.send({ body: `View your note: ${noteUrl}` })
  }
}
```

### Signed URLs

Signed URLs include a cryptographic signature for secure, tamper-proof links (e.g., email unsubscribe, file downloads). Requires `APP_SECRET` environment variable.

```typescript
// Generate a signed URL (valid indefinitely)
const url = await ctx.signedUrl('unsubscribe', { userId: '1' })
// -> '/api/v1/unsubscribe/1?signature=abc123'

// Generate a temporary signed URL (expires in 1 hour)
const tempUrl = await ctx.signedUrl('download', { fileId: '1' }, { expiresIn: 3600 })
// -> '/api/v1/download/1?expires=1234567890&signature=abc123'

// Verify the current request has a valid signature
const isValid = await ctx.hasValidSignature()
```

Add `APP_SECRET` to your `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "APP_SECRET": "your-secret-key"
  }
}
```

### Uri Service (Advanced)

For the full URL generation API, inject the `Uri` service via DI:

```typescript
import { ROUTER_TOKENS } from 'stratal/router'
import type { Uri } from 'stratal/router'
import { Transient, inject } from 'stratal/di'

@Transient()
export class MyService {
  constructor(
    @inject(ROUTER_TOKENS.Uri) private uri: Uri,
  ) {}

  generateUrls() {
    // Named route URL
    this.uri.route('users.show', { id: '1' })

    // Signed route
    await this.uri.signedRoute('unsubscribe', { user: '1' }, { expiresIn: 3600 })

    // Temporary signed route (shorthand)
    await this.uri.temporarySignedRoute('download', 3600, { file: '1' })

    // Current request info
    this.uri.current()        // pathname: '/api/v1/users'
    this.uri.full()           // pathname + query: '/api/v1/users?page=2'
    this.uri.previous()       // Referer header URL (fallback: '/')
    this.uri.previousPath()   // Referer pathname only

    // Build URL to raw path
    this.uri.to('/custom/path', { key: 'value' })

    // Set default params (e.g., in middleware)
    this.uri.defaults({ locale: 'en' })
    this.uri.route('posts.index')  // auto-fills :locale param
  }
}
```

### Type-Safe Route Names

Generate TypeScript types for autocomplete and type-checked params:

```bash
npx quarry route:types
npx quarry route:types --output=types/routes.d.ts
```

This generates a `StratalRouteMap` augmentation:

```typescript
// Auto-generated by `quarry route:types` — do not edit manually
declare module 'stratal/router' {
  interface StratalRouteMap {
    'notes.index': { params: never }
    'notes.show': { params: { id: string } }
    'notes.create': { params: never }
  }
}
```

## Domain Routing

Route requests based on the hostname — useful for multi-tenant apps, admin subdomains, or API separation.

### Controller-Level Domain

```typescript
@Controller('/dashboard', { domain: '{tenant}.myapp.com' })
export class TenantDashboardController {
  @Route({ response: dashboardSchema })
  async index(ctx: RouterContext) {
    const tenant = ctx.domain('tenant')  // e.g., 'acme'
    return ctx.json(await this.service.getDashboard(tenant))
  }
}
```

### Module-Level Domain (via Router)

Apply a domain pattern to all controllers in a module:

```typescript
@Module({ controllers: [DashboardController, SettingsController] })
export class TenantModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    router.domain('{tenant}.myapp.com')
  }
}
```

### Static Domains

Use a domain without parameters for fixed subdomains:

```typescript
@Controller('/admin', { domain: 'admin.myapp.com' })
export class AdminController { ... }
```

Requests to a non-matching domain receive a 404 response.

## Route Configuration (Router Fluent API)

Modules can implement `RouteConfigurable` to configure middleware, prefixes, domains, and route grouping for their controllers.

```typescript
import { Module } from 'stratal/module'
import type { RouteConfigurable } from 'stratal/router'
import { Router } from 'stratal/router'

@Module({
  controllers: [UsersController, PostsController, AdminController],
})
export class ApiModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    // Applied to all controllers in this module (except those in groups)
    router
      .prefix('/api')
      .name('api.')
      .middleware(CorsMiddleware)
      .version('1')

    // Sub-group with overrides for specific controllers
    router.group([AdminController], (r) => {
      r.prefix('/admin')
        .middleware(AdminAuthMiddleware)
        .hideFromDocs()
    })
  }
}
```

### Router Methods

| Method | Description |
|--------|-------------|
| `.prefix(path)` | Dynamic path prefix for controllers in scope |
| `.domain(pattern)` | Domain pattern (e.g., `{tenant}.myapp.com`) |
| `.name(prefix)` | Route name prefix |
| `.middleware(...classes)` | Middleware for controllers in scope |
| `.version(v)` | API version (string or array) |
| `.hideFromDocs(hide?)` | Hide routes from OpenAPI docs |
| `.throttle(name)` | Apply a named rate limiter to controllers in scope (see `references/rate-limiter.md`) |
| `.use(...classes)` | **Global middleware** — all routes in entire app (root Router only) |
| `.group(controllers, callback)` | Sub-group with its own config |

### Global Middleware

`router.use()` registers middleware that runs on every route in the app. Only callable at the root level — throws if called inside `group()`:

```typescript
configureRoutes(router: Router): void {
  // Global — runs on ALL routes app-wide
  router.use(CorsMiddleware, SecurityHeadersMiddleware)

  // Scoped — only this module's controllers
  router.middleware(LoggingMiddleware)
}
```

### Route Groups

Group specific controllers with shared configuration. Controllers in a group are excluded from the parent scope:

```typescript
configureRoutes(router: Router): void {
  // Default scope — applies to UsersController, PostsController
  router.middleware(ApiMiddleware)

  // AdminController gets its own config instead
  router.group([AdminController], (r) => {
    r.prefix('/admin')
      .middleware(AdminAuthMiddleware)
      .name('admin.')
  })
}
```

## Request Body Content Types

```typescript
// Default: application/json
@Route({ body: createSchema, response: schema })

// Multipart form data
@Route({
  body: { schema: uploadSchema, contentType: 'multipart/form-data' },
  response: schema,
})
```

## Schemas with Zod

Always import `z` from `stratal/validation`. Use `.openapi('SchemaName')` to name schemas in the OpenAPI spec:

```typescript
import { z } from 'stratal/validation'

export const createNoteSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().optional(),
}).openapi('CreateNote')

export const noteSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string().nullable(),
  createdAt: z.string().datetime(),
}).openapi('Note')
```

### i18n Validation Messages

Use `withI18n()` for translatable validation messages:

```typescript
import { z, withI18n } from 'stratal/validation'

export const createNoteSchema = z.object({
  title: z.string()
    .min(1, withI18n('validation.notes.title.required'))
    .max(255, withI18n('validation.notes.title.max', { max: 255 })),
  content: z.string().optional(),
}).openapi('CreateNote')
```

## API Versioning

Enable in the Stratal constructor:

```typescript
export default new Stratal({
  module: AppModule,
  versioning: { prefix: 'v', defaultVersion: '1' },
})
```

Use on controllers:

```typescript
import { VERSION_NEUTRAL } from 'stratal/router'

@Controller('/api/users', { version: '2' })       // -> /api/v2/users
@Controller('/api/users', { version: ['1', '2'] }) // -> /api/v1/users + /api/v2/users
@Controller('/api/health', { version: VERSION_NEUTRAL }) // -> /api/health (no prefix)
```

Or via the Router:

```typescript
configureRoutes(router: Router): void {
  router.version('2')  // All controllers in this module get v2
}
```

## Trailing Slash

Stratal can canonicalise trailing slashes globally. Configure via the `Stratal` constructor:

```typescript
import { Stratal } from 'stratal'
import { AppModule } from './app.module'

export default new Stratal({
  module: AppModule,
  trailingSlash: 'always', // 'ignore' (default) | 'always' | 'never'
})
```

| Mode | Incoming `/foo` | Incoming `/foo/` | Generated URLs |
|------|-----------------|-------------------|----------------|
| `'ignore'` (default) | matches `/foo` route | matches `/foo` route | as authored |
| `'always'` | 308 → `/foo/` | matches `/foo` route | trailing slash appended |
| `'never'` | matches `/foo` route | 308 → `/foo` | trailing slash stripped |

Redirects use **308 Permanent Redirect** so POST/PUT/PATCH bodies survive. The `Location` header is path-relative (no scheme/host), which avoids mixed-content blocks when the worker sits behind an HTTPS-terminating proxy that speaks HTTP internally.

**Skipped paths** (passed through unchanged in every mode):
- The root path `/`.
- For `'always'`: paths whose last segment contains `.` (file-like, e.g. `/api/openapi.json`, `/file.tar.gz`).

The configured mode is also applied to URL-generation helpers so generated links match incoming-request canonical form:

- `route(name, params?, options?)` (standalone, from `stratal/router`)
- `ctx.route(name, params?, options?)` (RouterContext)
- `Uri.route()`, `Uri.to()`, `Uri.query()`, `Uri.current()`, `Uri.full()`

Type export:

```typescript
import type { TrailingSlashMode } from 'stratal/router'
// 'ignore' | 'always' | 'never'
```

## Response Validation

When a route defines a `response` schema, the framework validates the actual response body against it. If the response doesn't match the declared schema, a `ResponseValidationError` is thrown.

```typescript
@Get('/:id', {
  response: noteSchema,  // Response body will be validated against this
})
async show(ctx: RouterContext) {
  const note = await this.service.findById(ctx.param('id'))
  return ctx.json(note)  // Throws ResponseValidationError if note doesn't match noteSchema
}
```

This catches server-side contract violations where a controller returns data that doesn't match its declared schema. Import `ResponseValidationError` from `stratal/router` if you need to handle it in a custom exception handler.

## OpenAPI

Routes automatically generate OpenAPI spec. Access at:
- `/api/openapi.json` — OpenAPI JSON spec
- `/api/docs` — Scalar UI

Security schemes: `'bearerAuth'` (Bearer token), `'basicAuth'` (Basic auth).

Configure via `OpenAPIModule.forRoot()`:

```typescript
import { OpenAPIModule } from 'stratal/openapi'

@Module({
  imports: [
    OpenAPIModule.forRoot({
      info: { title: 'My API', version: '1.0.0', description: 'My API description' },
    }),
  ],
})
export class AppModule {}
```
